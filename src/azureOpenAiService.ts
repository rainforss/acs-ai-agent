import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { config } from "dotenv";
import {
  createOutboundAudioData,
  createOutboundStopAudioData,
  OutStreamingData,
} from "@azure/communication-call-automation";
import { VoiceLiveClient } from "./utils/voiceLiveClient";
import {
  ItemCreateMessage,
  ResponseCreateMessage,
  SessionUpdateMessage,
  UserMessageType,
} from "./utils/models";
import https from "https";
import fetch from "node-fetch";
config();

let ws: WebSocket;

const aiFoundryVoiceLiveEndpoint =
  process.env.AI_FOUNDRY_VOICELIVE_ENDPOINT || "";
const aiFoundryKey = process.env.AI_FOUNDRY_API_KEY || "";

let realtimeStreaming: VoiceLiveClient;

export async function sendAudioToExternalAi(data: string) {
  try {
    const audio = data;
    if (audio) {
      await realtimeStreaming.send({
        type: "input_audio_buffer.append",
        audio: audio,
      });
    }
  } catch (e) {
    console.log(e);
  }
}

export async function startConversation(conversationId: string) {
  await startRealtime(aiFoundryVoiceLiveEndpoint, aiFoundryKey, conversationId);
}

async function startRealtime(
  endpoint: string,
  apiKey: string,
  conversationId: string
) {
  try {
    realtimeStreaming = new VoiceLiveClient(
      new URL(
        endpoint +
          `&model=${process.env.AI_MODEL_NAME}&agent-project-name=${process.env.AI_PROJECT_ID}`
      ),
      apiKey
    );
    console.log("sending session config");
    await realtimeStreaming.send(createConfigMessage());
    await realtimeStreaming.send(
      createResponseMessage(
        "You are a friendly and knowledgeable voice assistant representing Lululemon, trained to help customers find the perfect apparel and gear for their lifestyle. Your tone is warm, confident, and conversational—like a helpful store associate who knows the brand inside and out."
      )
    );
  } catch (error) {
    console.error("Error during startRealtime:", error);
  }

  setImmediate(async () => {
    try {
      await handleRealtimeMessages(conversationId);
    } catch (error) {
      console.error("Error handling real-time messages:", error);
    }
  });
}

function createResponseMessage(instructions): ResponseCreateMessage {
  const message: ResponseCreateMessage = {
    type: "response.create",
    response: {
      modalities: ["text", "audio"],
      instructions,
    },
  };
  return message;
}

function createConversationItem(
  text: string,
  conversationId: string,
  role: "system" | "user" | "assistant"
): ItemCreateMessage {
  const message: any = {
    type: "conversation.item.create",
    item: {
      call_id: conversationId,
      type: "message",
      content: [{ type: "input_text", text }],
      role,
    },
  };
  return message;
}

function createFunctionOutput(
  text: string,
  conversationId: string
): ItemCreateMessage {
  const message: any = {
    type: "conversation.item.create",
    item: {
      call_id: conversationId,
      type: "function_call_output",
      output: text,
    },
  };
  return message;
}

function createConfigMessage(): SessionUpdateMessage {
  const functions = [
    {
      type: "function",
      name: "schedule_callback",
      description:
        "Get a preferred product expert callback date and time in a specific time zone for the user",
      parameters: {
        type: "object",
        properties: {
          appointmentDate: {
            type: "string",
            format: "date-time",
            description:
              "The preferred date and time for product expert callback, in ISO 8601 UTC format (e.g., 2025-10-26T09:00:00Z) after time zone conversion.",
          },
          mobilePhone: {
            type: "string",
            description:
              "The customer's mobile phone number callback, including the country code (e.g., +14255550123). Repeat the phone number for user to confirm.",
            pattern: "^\\+[1-9]\\d{1,14}$",
          },
        },
        required: ["appointmentDate", "mobilePhone"],
      },
    },
    {
      type: "function",
      name: "send_recipe",
      description: "Send a link to the recipe.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  ];
  let configMessage: any = {
    instructions: `
    You are a friendly and knowledgeable voice assistant representing Lululemon, trained to help customers find the perfect apparel and gear for their lifestyle. Your tone is warm, confident, and conversational—like a helpful store associate who knows the brand inside and out.
Your responsibilities include:

Understanding the customer’s needs by asking relevant questions about their activity (e.g., yoga, running, training, travel), style preferences, climate, and fit.
Recommending specific Lululemon products based on their goals, including tops, bottoms, outerwear, accessories, and footwear.
Explaining product features clearly and concisely, such as fabric technologies (e.g., Nulu, Luxtreme, Warpstreme), fit types (e.g., slim, relaxed, oversized), and performance benefits.
Providing sizing guidance based on body type, fit preference, and product cut.
Highlighting new arrivals, seasonal collections, and limited editions when relevant.
Helping clients schedule callback from a Lululemon product expert if clients want to get more details before making a purchase.
Maintaining a natural, engaging tone that reflects Lululemon’s brand values: wellness, innovation, and inclusivity.

Always aim to make the customer feel confident, supported, and excited about their choices. Keep responses short and clear, and offer to repeat or clarify when needed.
    `,
    type: "session.update",
    session: {
      turn_detection: {
        type: "azure_semantic_vad",
        threshold: 0.3,
        prefix_padding_ms: 500,
        silence_duration_ms: 500,
        remove_filler_words: false,
        // end_of_utterance_detection: {
        //   model: "semantic_detection_v1",
        //   threshold: 0.01,
        //   timeout: 2,
        // },
      },
      input_audio_noise_reduction: { type: "azure_deep_noise_suppression" },
      input_audio_echo_cancellation: { type: "server_echo_cancellation" },
      voice: {
        name: "zh-CN-Yunfan:DragonHDLatestNeural",
        type: "azure-standard",
        temperature: 0.8,
      },
      tools: functions,
    },
  };

  return configMessage;
}

export async function handleRealtimeMessages(conversationId: string) {
  for await (const message of realtimeStreaming.messages()) {
    switch (message.type) {
      case "session.created":
        console.log("session started with id:-->" + message.session.id);
        break;
      case "response.audio_transcript.delta":
        break;
      case "response.audio.delta":
        await receiveAudioForOutbound(message.delta);
        break;
      case "input_audio_buffer.speech_started":
        console.log(
          `Voice activity detection started at ${message.audio_start_ms} ms`
        );
        stopAudio();
        break;
      case "conversation.item.input_audio_transcription.completed":
        console.log(`User:- ${message.transcript}`);
        break;
      case "response.audio_transcript.done":
        console.log(`AI:- ${message.transcript}`);
        break;
      case "response.done":
        break;
      case "response.function_call_arguments.done":
        console.log("Function arguments: ", message.arguments);

        if (message.name === "schedule_callback") {
          // await realtimeStreaming.send(
          //   createFunctionOutput("Booking the appointment now.", conversationId)
          // );
          // await realtimeStreaming.send(
          //   createResponseMessage(
          //     "Thank the user's patient in waiting while you enter the booking information into the system."
          //   )
          // );
          const httpsAgent = new https.Agent({
            rejectUnauthorized: false,
          });
          const response = await fetch(
            "https://03f8d831c688efbd8b1974fd770e4c.f4.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/bcec5c21bc0d4795858e09b90a94d40b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=gNN65YHpNEZ78JXT47xhOVGayDr4A1Pt9attnfRZUy4",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: message.arguments,
              agent: httpsAgent,
            }
          );
          const data = await response.json();
          console.log(data);
          if (data.success) {
            await realtimeStreaming.send(
              createConversationItem(
                "Appointment has been booked, is there anything else I can help you with?",
                conversationId,
                "assistant"
              )
            );
            await realtimeStreaming.send(
              createResponseMessage(
                "Respond to the user that appointment has been booked successfully. Be concise and friendly, ask the user if there is anything else that you can help with."
              )
            );
          }
        }
      case "conversation.item.created":
        console.log(
          "Conversation item created: ",
          message.type,
          message.event_id
        );
      default:
        break;
    }
  }
}

export async function initWebsocket(socket: WebSocket) {
  ws = socket;
}

async function stopAudio() {
  try {
    const jsonData = createOutboundStopAudioData();
    sendMessage(jsonData);
  } catch (e) {
    console.log(e);
  }
}
async function receiveAudioForOutbound(data: string) {
  try {
    const jsonData = createOutboundAudioData(data);
    sendMessage(jsonData);
  } catch (e) {
    console.log(e);
  }
}

async function sendMessage(data: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  } else {
    console.log("socket connection is not open.");
  }
}
