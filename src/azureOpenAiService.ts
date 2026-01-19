import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { config } from "dotenv";
import {
  CallAutomationClient,
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
import { PhoneNumberIdentifier } from "@azure/communication-common";
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

export async function startConversation(
  conversationId: string,
  acsClient: CallAutomationClient,
  customerFirstName?: string,
  customerPrompt?: string,
) {
  await startRealtime(
    aiFoundryVoiceLiveEndpoint,
    aiFoundryKey,
    conversationId,
    acsClient,
    customerFirstName,
    customerPrompt,
  );
}

async function startRealtime(
  endpoint: string,
  apiKey: string,
  conversationId: string,
  acsClient: CallAutomationClient,
  customerFirstName?: string,
  customerPrompt?: string,
) {
  try {
    realtimeStreaming = new VoiceLiveClient(
      new URL(
        endpoint +
          `&model=${process.env.AI_MODEL_NAME}&agent-project-name=${process.env.AI_PROJECT_ID}`,
      ),
      apiKey,
    );
    const agentRoleDescription = customerFirstName
      ? "You are a helpful, friendly, and knowledgeable virtual assistant for Bath Fitter, a company specializing in custom bath and shower remodeling."
      : "You are a helpful, friendly, and knowledgeable virtual assistant for BFL Canada.";
    const initiationMessage = customerPrompt
      ? `${agentRoleDescription} You are talking to a customer named ${customerFirstName}. ${customerPrompt}`
      : `${agentRoleDescription} ${customerFirstName ? `You are talking to a customer named ${customerFirstName}.` : ""} Greet the customer in English and ask if the customer needs any help.`;
    await realtimeStreaming.send(createConfigMessage());
    await realtimeStreaming.send(createResponseMessage(initiationMessage));
  } catch (error) {
    console.error("Error during startRealtime:", error);
  }

  setImmediate(async () => {
    try {
      await handleRealtimeMessages(conversationId, acsClient);
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
  role: "system" | "user" | "assistant",
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
  conversationId: string,
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

function createConfigMessage(customerName?: string): SessionUpdateMessage {
  const functions = [
    {
      type: "function",
      name: "book_appointment",
      description:
        "Book a branch appointment with date and time in a specific time zone for the user, using user's phone number. Ask user to confirm the appointment time in user's time zone and phone number before calling the function.",
      parameters: {
        type: "object",
        properties: {
          appointmentDate: {
            type: "string",
            format: "date-time",
            description:
              "The preferred date and time for appointment, in ISO 8601 UTC format (e.g., 2025-10-26T09:00:00Z) after converting from user's time zone. Repeat the time in user's time zone for confirmation.",
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
      name: "send_summary",
      description:
        "Summarize the information provided to the customer in customer's preferred language and send the summary to customer's preferred email address. Always repeat the email address for customer to confirm before performing this action.",
      parameters: {
        type: "object",
        properties: {
          emailAddress: {
            type: "string",
            pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+.[a-zA-Z]{2,}$",
            description:
              "The preferred email address of customer, always repeat the collected email address and proceed only if customer confirms it is correct.",
          },
          agentSummary: {
            type: "string",
            description:
              "Summarized conversation or instruction, translated to client's preferred language. Always ask client to specified the preferred language",
          },
        },
        required: ["emailAddress", "agentSummary"],
      },
    },
    // {
    //   type: "function",
    //   name: "escalate",
    //   description:
    //     "Escalate and transfer the call to a customer service representative if customer requests to speak to someone or if customer is clearly getting frustrated.",
    //   parameters: {},
    // },
  ];
  const bflInstruction: string = `
  You are BFL CANADA Virtual Assistant, a helpful, concise insurance brokerage assistant for Canada-based visitors. Your job is to:
- Help people understand BFL CANADA’s services and locations.
- Help them start a booking with a BFL advisor (preliminary risk assessment) or connect them with the right office.
- Provide self-serve links for claims, client login, and contact requests.
- Escalate to a human or the proper channel when needed.
GROUNDING & SOURCES
- Only use information from BFL CANADA’s public web pages and widely available public listings referenced below. Do not invent products, guarantees, pricing, or hours.
TONE & STYLE
- Be warm, concise, and professional.
- Use plain language. Offer bulleted options and clear next steps.
- Always include a relevant official BFL link when you give an action.
BEHAVIOUR
- Always include at least one official BFL link in your answers.
- If you’re unsure, say so briefly and direct the user to the Contact page.
- Keep replies under 120 words unless the user asks for more detail.
  `;
  let configMessage: any = {
    instructions: customerName
      ? `
You are a helpful, friendly, and knowledgeable virtual assistant for Bath Fitter, a company specializing in custom bath and shower remodeling. Your primary responsibilities are:


Booking Appointments:

Help customers schedule free in-home consultations.
Collect necessary information such as name, contact details, location, preferred dates/times, and type of service (e.g., bathtub replacement, shower conversion).
Confirm appointment details and provide follow-up instructions.



Answering Questions:

Provide clear, accurate, and concise answers about Bath Fitter’s products, services, installation process, warranties, pricing estimates, and financing options.
Direct customers to appropriate resources or escalate to a human representative when needed.



Tone and Style:

Be warm, professional, and reassuring.
Use plain language and avoid technical jargon unless requested.
Always aim to make the customer feel heard and supported.



Limitations:

Do not provide exact pricing without a consultation.
Do not make guarantees about installation timelines without checking availability.
Always respect customer privacy and data security.



Example interactions:

“Hi! I’d like to replace my old tub with a walk-in shower. Can you help me book a consultation?”
“What’s the typical installation time for a Bath Fitter remodel?”
“Do you offer financing options?”
    `
      : bflInstruction,
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
        name: "en-US-SamuelMultilingualNeural",
        type: "azure-standard",
        temperature: 0.8,
      },
      tools: functions,
    },
  };

  return configMessage;
}

export async function handleRealtimeMessages(
  conversationId: string,
  acsClient?: CallAutomationClient,
) {
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
          `Voice activity detection started at ${message.audio_start_ms} ms`,
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
        await realtimeStreaming.send(
          createConversationItem(
            "I am processing the request and this will take just a moment. Thank you for your patience.",
            conversationId,
            "assistant",
          ),
        );

        if (message.name === "escalate") {
          const sourceCallerIdNumber = (
            await acsClient.getCallConnection(conversationId).listParticipants()
          ).values;
          console.log(sourceCallerIdNumber);
          await acsClient
            .getCallConnection(conversationId)
            .getCallMedia()
            .stopMediaStreaming({ operationContext: "stopMediaStreaming" });
          try {
            await acsClient.getCallConnection(conversationId).addParticipant({
              targetParticipant: { phoneNumber: "+14032124840" },
              sourceDisplayName: "Jake",
              sourceCallIdNumber: {
                phoneNumber: "+14388140297",
              },
            });
          } catch (e) {
            console.log(e, e.message);
          }
        }

        if (message.name === "send_summary") {
          const httpsAgent = new https.Agent({
            rejectUnauthorized: false,
          });
          // await realtimeStreaming.send(
          //   createConversationItem(
          //     "I am sending the summary to you and this will take just a moment. Thank you for your patience.",
          //     conversationId,
          //     "assistant",
          //   ),
          // );

          const response = await fetch(
            "https://03f8d831c688efbd8b1974fd770e4c.f4.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/bcec5c21bc0d4795858e09b90a94d40b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=gNN65YHpNEZ78JXT47xhOVGayDr4A1Pt9attnfRZUy4",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ...JSON.parse(message.arguments),
                function: "send_summary",
              }),
              agent: httpsAgent,
            },
          );
          const data = await response.json();
          console.log(data);
          if (data.success) {
            // await realtimeStreaming.send(
            //   createConversationItem(
            //     "Summary has been sent to your email, is there anything else I can help you with?",
            //     conversationId,
            //     "assistant",
            //   ),
            // );
            // await realtimeStreaming.send(
            //   createResponseMessage(
            //     "Respond to the user that summary has been sent successfully. Be concise and friendly, ask the user if there is anything else that you can help with.",
            //   ),
            // );
          }
        }

        if (message.name === "book_appointment") {
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

          // await realtimeStreaming.send(
          //   createConversationItem(
          //     "I am booking the appointment for you and this will take just a moment. Thank you for your patience.",
          //     conversationId,
          //     "assistant",
          //   ),
          // );

          const response = await fetch(
            "https://03f8d831c688efbd8b1974fd770e4c.f4.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/bcec5c21bc0d4795858e09b90a94d40b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=gNN65YHpNEZ78JXT47xhOVGayDr4A1Pt9attnfRZUy4",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: message.arguments,
              agent: httpsAgent,
            },
          );
          const data = await response.json();
          console.log(data);
          if (data.success) {
            // await realtimeStreaming.send(
            //   createConversationItem(
            //     "Appointment has been booked, is there anything else I can help you with?",
            //     conversationId,
            //     "assistant",
            //   ),
            // );
            await realtimeStreaming.send(
              createResponseMessage(
                "Respond to the user that appointment has been booked successfully. Be concise and friendly, ask the user if there is anything else that you can help with.",
              ),
            );
          }
        }
      case "conversation.item.created":
        console.log(
          "Conversation item created: ",
          message.type,
          message.event_id,
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
