import { config } from "dotenv";
import express, { Application } from "express";
import http from "http";
import {
  CallAutomationClient,
  AnswerCallOptions,
  AnswerCallResult,
  MediaStreamingOptions,
  CallInvite,
  CreateCallOptions,
} from "@azure/communication-call-automation";

import { v4 as uuidv4 } from "uuid";

import WebSocket, { WebSocketServer } from "ws";
import { startConversation, initWebsocket } from "./azureOpenAiService";
import { processWebsocketMessageAsync } from "./mediaStreamingHandler";
import { PhoneNumberIdentifier } from "@azure/communication-common";

config();

const PORT = process.env.PORT;
const app: Application = express();
app.use(express.json());
// Create common server for app and websocket
const server = http.createServer(app);

let acsClient: CallAutomationClient;
let answerCallResult: AnswerCallResult;
let callerId: string;

async function createAcsClient() {
  const connectionString = process.env.CONNECTION_STRING || "";
  acsClient = new CallAutomationClient(connectionString);
  console.log("Initialized ACS Client.");
}

async function createOutboundCall(callee, mediaStreamingOptions) {
  try {
    const targetParticipant: PhoneNumberIdentifier = {
      phoneNumber: callee,
    };
    const callInvite: CallInvite = {
      targetParticipant,
      sourceCallIdNumber: {
        phoneNumber: process.env.ACS_RESOURCE_PHONE_NUMBER || "",
      },
    };

    const options: CreateCallOptions = {
      mediaStreamingOptions,
    };
    console.log("Placing outbound call...");
    acsClient.createCall(
      callInvite,
      process.env.NODE_ENV === "production"
        ? process.env.CALLBACK_URI_PROD
        : process.env.CALLBACK_URI + "/api/callbacks",
      options,
    );
  } catch (e) {
    console.log(e.message);
  }
}

app.post("/api/outboundCall", async (req: any, res: any) => {
  console.log(req.body);
  const { callee } = req.body;
  const websocketUrl = (
    process.env.NODE_ENV === "production"
      ? process.env.CALLBACK_URI_PROD
      : process.env.CALLBACK_URI
  ).replace(/^https:\/\//, "wss://");
  const mediaStreamingOptions: MediaStreamingOptions = {
    transportUrl: websocketUrl,
    transportType: "websocket",
    contentType: "audio",
    audioChannelType: "unmixed",
    startMediaStreaming: true,
    enableBidirectional: true,
    audioFormat: "Pcm24KMono",
  };
  await createOutboundCall(callee, mediaStreamingOptions);
});

app.post("/api/incomingCall", async (req: any, res: any) => {
  const event = req.body[0];
  try {
    const eventData = event.data;
    if (event.eventType === "Microsoft.EventGrid.SubscriptionValidationEvent") {
      console.log("Received SubscriptionValidation event");
      res.status(200).json({
        validationResponse: eventData.validationCode,
      });

      return;
    }

    callerId = eventData.from.rawId;

    const uuid = uuidv4();
    const callbackUri = `${
      process.env.NODE_ENV === "production"
        ? process.env.CALLBACK_URI_PROD
        : process.env.CALLBACK_URI
    }/api/callbacks/${uuid}?callerId=${callerId}`;
    console.log(callbackUri);
    const incomingCallContext = eventData.incomingCallContext;
    const websocketUrl = (
      process.env.NODE_ENV === "production"
        ? process.env.CALLBACK_URI_PROD
        : process.env.CALLBACK_URI
    ).replace(/^https:\/\//, "wss://");
    const mediaStreamingOptions: MediaStreamingOptions = {
      transportUrl: websocketUrl,
      transportType: "websocket",
      contentType: "audio",
      audioChannelType: "unmixed",
      startMediaStreaming: true,
      enableBidirectional: true,
      audioFormat: "Pcm24KMono",
    };

    const answerCallOptions: AnswerCallOptions = {
      mediaStreamingOptions: mediaStreamingOptions,
    };

    answerCallResult = await acsClient.answerCall(
      incomingCallContext,
      callbackUri,
      answerCallOptions,
    );

    console.log(
      `Answer call ConnectionId:--> ${answerCallResult.callConnectionProperties.callConnectionId} ${answerCallResult.callConnectionProperties.answeredby.communicationUserId}`,
    );
  } catch (error) {
    console.error("Error during the incoming call event.", error);
  }
});

app.post("/api/callbacks/:contextId", async (req: any, res: any) => {
  const event = req.body[0];
  const eventData = event.data;
  const callConnectionId = eventData.callConnectionId;
  console.log(
    `Received Event:-> ${event.type}, Correlation Id:-> ${eventData.correlationId}, CallConnectionId:-> ${callConnectionId}`,
  );
  if (event.type === "Microsoft.Communication.CallConnected") {
    if (eventData.operationContext === "stopMediaStreaming") {
      return console.log("Media Streaming Stopped.");
    }
    const callConnectionProperties = await acsClient
      .getCallConnection(callConnectionId)
      .getCallConnectionProperties();
    const mediaStreamingSubscription =
      callConnectionProperties.mediaStreamingSubscription;
    console.log(
      "MediaStreamingSubscription:-->" +
        JSON.stringify(mediaStreamingSubscription),
    );
  } else if (event.type === "Microsoft.Communication.MediaStreamingStarted") {
    console.log(`Operation context:--> ${eventData.operationContext}`);
    console.log(
      `Media streaming content type:--> ${eventData.mediaStreamingUpdate.contentType}`,
    );
    console.log(
      `Media streaming status:--> ${eventData.mediaStreamingUpdate.mediaStreamingStatus}`,
    );
    console.log(
      `Media streaming status details:--> ${eventData.mediaStreamingUpdate.mediaStreamingStatusDetails}`,
    );
  } else if (event.type === "Microsoft.Communication.MediaStreamingStopped") {
    console.log(`Operation context:--> ${eventData.operationContext}`);
    console.log(
      `Media streaming content type:--> ${eventData.mediaStreamingUpdate.contentType}`,
    );
    console.log(
      `Media streaming status:--> ${eventData.mediaStreamingUpdate.mediaStreamingStatus}`,
    );
    console.log(
      `Media streaming status details:--> ${eventData.mediaStreamingUpdate.mediaStreamingStatusDetails}`,
    );
  } else if (event.type === "Microsoft.Communication.MediaStreamingFailed") {
    console.log(`Operation context:--> ${eventData.operationContext}`);
    console.log(
      `Code:->${eventData.resultInformation.code}, Subcode:->${eventData.resultInformation.subCode}`,
    );
    console.log(`Message:->${eventData.resultInformation.message}`);
  } else if (event.type === "Microsoft.Communication.CallDisconnected") {
    console.log(`Call Disconnected:->${eventData.resultInformation.message} `);
  } else if (event.type === "Microsoft.Communication.AddParticipantFailed") {
    console.log(
      `Add Participant Failed:->${eventData.resultInformation.message} `,
    );
  }
});

app.get("/", (req, res) => {
  res.send("Hello ACS CallAutomation!");
});

// Start the server
server.listen(PORT, async () => {
  console.log(`Server is listening on port ${PORT}`);
  await createAcsClient();
});

//Websocket for receiving mediastreaming.
const wss = new WebSocketServer({ server });
wss.on("connection", async (ws: WebSocket) => {
  console.log("Client connected");
  await initWebsocket(ws);
  await startConversation(
    answerCallResult.callConnectionProperties.callConnectionId,
    acsClient,
  );
  ws.on("message", async (packetData: ArrayBuffer) => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        await processWebsocketMessageAsync(packetData);
      } else {
        console.warn(`ReadyState: ${ws.readyState}`);
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  });
  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

console.log(`WebSocket server running on port ${PORT}`);
