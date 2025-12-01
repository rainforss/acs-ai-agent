"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const communication_call_automation_1 = require("@azure/communication-call-automation");
const uuid_1 = require("uuid");
const ws_1 = __importStar(require("ws"));
const azureOpenAiService_1 = require("./azureOpenAiService");
const mediaStreamingHandler_1 = require("./mediaStreamingHandler");
(0, dotenv_1.config)();
const PORT = process.env.PORT;
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Create common server for app and websocket
const server = http_1.default.createServer(app);
let acsClient;
let answerCallResult;
let callerId;
function createAcsClient() {
    return __awaiter(this, void 0, void 0, function* () {
        const connectionString = process.env.CONNECTION_STRING || "";
        acsClient = new communication_call_automation_1.CallAutomationClient(connectionString);
        console.log("Initialized ACS Client.");
    });
}
function createOutboundCall(callee, mediaStreamingOptions) {
    return __awaiter(this, void 0, void 0, function* () {
        const callInvite = {
            targetParticipant: callee,
            sourceCallIdNumber: {
                phoneNumber: process.env.ACS_RESOURCE_PHONE_NUMBER || "",
            },
        };
        const options = {
            callIntelligenceOptions: {
                cognitiveServicesEndpoint: process.env.COGNITIVE_SERVICES_ENDPOINT,
            },
            mediaStreamingOptions,
        };
        console.log("Placing outbound call...");
        acsClient.createCall(callInvite, process.env.NODE_ENV === "production"
            ? process.env.CALLBACK_URI_PROD
            : process.env.CALLBACK_URI + "/api/callbacks", options);
    });
}
app.post("/api/outboundCall", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { callee } = req.body;
}));
app.post("/api/incomingCall", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const uuid = (0, uuid_1.v4)();
        const callbackUri = `${process.env.NODE_ENV === "production"
            ? process.env.CALLBACK_URI_PROD
            : process.env.CALLBACK_URI}/api/callbacks/${uuid}?callerId=${callerId}`;
        console.log(callbackUri);
        const incomingCallContext = eventData.incomingCallContext;
        const websocketUrl = (process.env.NODE_ENV === "production"
            ? process.env.CALLBACK_URI_PROD
            : process.env.CALLBACK_URI).replace(/^https:\/\//, "wss://");
        const mediaStreamingOptions = {
            transportUrl: websocketUrl,
            transportType: "websocket",
            contentType: "audio",
            audioChannelType: "unmixed",
            startMediaStreaming: true,
            enableBidirectional: true,
            audioFormat: "Pcm24KMono",
        };
        const answerCallOptions = {
            mediaStreamingOptions: mediaStreamingOptions,
        };
        answerCallResult = yield acsClient.answerCall(incomingCallContext, callbackUri, answerCallOptions);
        console.log(`Answer call ConnectionId:--> ${answerCallResult.callConnectionProperties.callConnectionId} ${answerCallResult.callConnectionProperties.answeredby.communicationUserId}`);
    }
    catch (error) {
        console.error("Error during the incoming call event.", error);
    }
}));
app.post("/api/callbacks/:contextId", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const event = req.body[0];
    const eventData = event.data;
    const callConnectionId = eventData.callConnectionId;
    console.log(`Received Event:-> ${event.type}, Correlation Id:-> ${eventData.correlationId}, CallConnectionId:-> ${callConnectionId}`);
    if (event.type === "Microsoft.Communication.CallConnected") {
        if (eventData.operationContext === "stopMediaStreaming") {
            return console.log("Media Streaming Stopped.");
        }
        const callConnectionProperties = yield acsClient
            .getCallConnection(callConnectionId)
            .getCallConnectionProperties();
        const mediaStreamingSubscription = callConnectionProperties.mediaStreamingSubscription;
        console.log("MediaStreamingSubscription:-->" +
            JSON.stringify(mediaStreamingSubscription));
    }
    else if (event.type === "Microsoft.Communication.MediaStreamingStarted") {
        console.log(`Operation context:--> ${eventData.operationContext}`);
        console.log(`Media streaming content type:--> ${eventData.mediaStreamingUpdate.contentType}`);
        console.log(`Media streaming status:--> ${eventData.mediaStreamingUpdate.mediaStreamingStatus}`);
        console.log(`Media streaming status details:--> ${eventData.mediaStreamingUpdate.mediaStreamingStatusDetails}`);
    }
    else if (event.type === "Microsoft.Communication.MediaStreamingStopped") {
        console.log(`Operation context:--> ${eventData.operationContext}`);
        console.log(`Media streaming content type:--> ${eventData.mediaStreamingUpdate.contentType}`);
        console.log(`Media streaming status:--> ${eventData.mediaStreamingUpdate.mediaStreamingStatus}`);
        console.log(`Media streaming status details:--> ${eventData.mediaStreamingUpdate.mediaStreamingStatusDetails}`);
    }
    else if (event.type === "Microsoft.Communication.MediaStreamingFailed") {
        console.log(`Operation context:--> ${eventData.operationContext}`);
        console.log(`Code:->${eventData.resultInformation.code}, Subcode:->${eventData.resultInformation.subCode}`);
        console.log(`Message:->${eventData.resultInformation.message}`);
    }
    else if (event.type === "Microsoft.Communication.CallDisconnected") {
        console.log(`Call Disconnected:->${eventData.resultInformation.message} `);
    }
    else if (event.type === "Microsoft.Communication.AddParticipantFailed") {
        console.log(`Add Participant Failed:->${eventData.resultInformation.message} `);
    }
}));
app.get("/", (req, res) => {
    res.send("Hello ACS CallAutomation!");
});
// Start the server
server.listen(PORT, () => __awaiter(void 0, void 0, void 0, function* () {
    console.log(`Server is listening on port ${PORT}`);
    yield createAcsClient();
}));
//Websocket for receiving mediastreaming.
const wss = new ws_1.WebSocketServer({ server });
wss.on("connection", (ws) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Client connected");
    yield (0, azureOpenAiService_1.initWebsocket)(ws);
    yield (0, azureOpenAiService_1.startConversation)(answerCallResult.callConnectionProperties.callConnectionId, acsClient);
    ws.on("message", (packetData) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            if (ws.readyState === ws_1.default.OPEN) {
                yield (0, mediaStreamingHandler_1.processWebsocketMessageAsync)(packetData);
            }
            else {
                console.warn(`ReadyState: ${ws.readyState}`);
            }
        }
        catch (error) {
            console.error("Error processing WebSocket message:", error);
        }
    }));
    ws.on("close", () => {
        console.log("Client disconnected");
    });
}));
console.log(`WebSocket server running on port ${PORT}`);
