import WebSocket from "ws";
import { config } from "dotenv";
import {
  createOutboundAudioData,
  createOutboundStopAudioData,
  OutStreamingData,
} from "@azure/communication-call-automation";
import { VoiceLiveClient } from "./utils/voiceLiveClient";
import { SessionUpdateMessage } from "./utils/models";
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

export async function startConversation() {
  await startRealtime(aiFoundryVoiceLiveEndpoint, aiFoundryKey);
}

async function startRealtime(endpoint: string, apiKey: string) {
  try {
    realtimeStreaming = new VoiceLiveClient(
      new URL(
        endpoint +
          `&agent_id=${process.env.AI_AGENT_ID}&project_id=${process.env.AI_PROJECT_ID}&agent-project-name=${process.env.AI_PROJECT_ID}&api-key=${apiKey}`
      ),
      apiKey
    );
    console.log("sending session config");
    await realtimeStreaming.send(createConfigMessage());
    console.log("sent");
  } catch (error) {
    console.error("Error during startRealtime:", error);
  }

  setImmediate(async () => {
    try {
      await handleRealtimeMessages();
    } catch (error) {
      console.error("Error handling real-time messages:", error);
    }
  });
}

function createConfigMessage(): SessionUpdateMessage {
  let configMessage: any = {
    type: "session.update",
    session: {
      turn_detection: {
        type: "server_vad",
        threshold: 0.3,
        prefix_padding_ms: 200,
        silence_duration_ms: 200,
        remove_filler_words: false,
        end_of_utterance_detection: {
          model: "semantic_detection_v1",
          threshold: 0.01,
          timeout: 2,
        },
      },
      input_audio_noise_reduction: { type: "azure_deep_noise_suppression" },
      input_audio_echo_cancellation: { type: "server_echo_cancellation" },
      voice: {
        name: "en-US-Ava:DragonHDLatestNeural",
        type: "azure-standard",
        temperature: 0.8,
      },
    },
  };

  return configMessage;
}

export async function handleRealtimeMessages() {
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
        console.log(message.response.status);
        break;
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
