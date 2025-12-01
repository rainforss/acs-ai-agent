"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAudioToExternalAi = sendAudioToExternalAi;
exports.startConversation = startConversation;
exports.handleRealtimeMessages = handleRealtimeMessages;
exports.initWebsocket = initWebsocket;
const ws_1 = __importDefault(require("ws"));
const dotenv_1 = require("dotenv");
const communication_call_automation_1 = require("@azure/communication-call-automation");
const voiceLiveClient_1 = require("./utils/voiceLiveClient");
const https_1 = __importDefault(require("https"));
const node_fetch_1 = __importDefault(require("node-fetch"));
(0, dotenv_1.config)();
let ws;
const aiFoundryVoiceLiveEndpoint = process.env.AI_FOUNDRY_VOICELIVE_ENDPOINT || "";
const aiFoundryKey = process.env.AI_FOUNDRY_API_KEY || "";
let realtimeStreaming;
function sendAudioToExternalAi(data) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const audio = data;
            if (audio) {
                yield realtimeStreaming.send({
                    type: "input_audio_buffer.append",
                    audio: audio,
                });
            }
        }
        catch (e) {
            console.log(e);
        }
    });
}
function startConversation(conversationId, acsClient) {
    return __awaiter(this, void 0, void 0, function* () {
        yield startRealtime(aiFoundryVoiceLiveEndpoint, aiFoundryKey, conversationId, acsClient);
    });
}
function startRealtime(endpoint, apiKey, conversationId, acsClient) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            realtimeStreaming = new voiceLiveClient_1.VoiceLiveClient(new URL(endpoint +
                `&model=${process.env.AI_MODEL_NAME}&agent-project-name=${process.env.AI_PROJECT_ID}`), apiKey);
            console.log("sending session config");
            yield realtimeStreaming.send(createConfigMessage());
            yield realtimeStreaming.send(createResponseMessage("You are Gateway Mechanical Service's Virtual Assistant. Your job is to provide fast, accurate, and friendly answers to common member questions based on publicly available information on Gateway Mechanical Service's website. You are talking to a customer named Jake, greet the customer in English and ask if the customer needs any help."));
        }
        catch (error) {
            console.error("Error during startRealtime:", error);
        }
        setImmediate(() => __awaiter(this, void 0, void 0, function* () {
            try {
                yield handleRealtimeMessages(conversationId, acsClient);
            }
            catch (error) {
                console.error("Error handling real-time messages:", error);
            }
        }));
    });
}
function createResponseMessage(instructions) {
    const message = {
        type: "response.create",
        response: {
            modalities: ["text", "audio"],
            instructions,
        },
    };
    return message;
}
function createConversationItem(text, conversationId, role) {
    const message = {
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
function createFunctionOutput(text, conversationId) {
    const message = {
        type: "conversation.item.create",
        item: {
            call_id: conversationId,
            type: "function_call_output",
            output: text,
        },
    };
    return message;
}
function createConfigMessage() {
    const functions = [
        {
            type: "function",
            name: "book_appointment",
            description: "Book a branch appointment with date and time in a specific time zone for the user",
            parameters: {
                type: "object",
                properties: {
                    appointmentDate: {
                        type: "string",
                        format: "date-time",
                        description: "The preferred date and time for appointment, in ISO 8601 UTC format (e.g., 2025-10-26T09:00:00Z) after converting from user's time zone.",
                    },
                    mobilePhone: {
                        type: "string",
                        description: "The customer's mobile phone number callback, including the country code (e.g., +14255550123). Repeat the phone number for user to confirm.",
                        pattern: "^\\+[1-9]\\d{1,14}$",
                    },
                },
                required: ["appointmentDate", "mobilePhone"],
            },
        },
        {
            type: "function",
            name: "send_summary",
            description: "Summarize the information provided to the customer in customer's preferred language and send the summary to customer's preferred email address. Always repeat the email address for customer to confirm before performing this action.",
            parameters: {
                type: "object",
                properties: {
                    emailAddress: {
                        type: "string",
                        pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+.[a-zA-Z]{2,}$",
                        description: "The preferred email address of customer, always repeat the collected email address and proceed only if customer confirms it is correct.",
                    },
                    agentSummary: {
                        type: "string",
                        description: "Summarized conversation or instruction, translated to client's preferred language. Always ask client to specified the preferred language",
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
    let configMessage = {
        instructions: `
    You are a helpful and professional virtual assistant for Gateway Mechanical Services, a trusted provider of HVAC, refrigeration, and mechanical services across Western Canada. Your primary responsibilities are:

Booking Appointments: Help customers schedule service appointments for maintenance, repairs, or consultations. Collect relevant details such as:

Customer name and contact information
Service location
Type of service needed (e.g., HVAC repair, refrigeration maintenance)
Preferred date and time


Answering Questions: Provide clear, friendly, and accurate responses to customer inquiries about:

Services offered
Service areas and coverage
Emergency support availability
Pricing estimates (if available)
Warranty and service guarantees


Escalation and Handoff: If a question is too complex or requires human intervention, offer to escalate the request to a live representative or direct the customer to the appropriate contact channel.

Maintain a courteous and professional tone at all times. Always confirm details with the customer and offer additional help before ending the conversation. You should avoid emotional expressions like laughter. You should speak slowly and clearly.
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
                name: "en-US-SamuelMultilingualNeural",
                type: "azure-standard",
                temperature: 0.8,
            },
            tools: functions,
        },
    };
    return configMessage;
}
function handleRealtimeMessages(conversationId, acsClient) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        try {
            for (var _d = true, _e = __asyncValues(realtimeStreaming.messages()), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                _c = _f.value;
                _d = false;
                const message = _c;
                switch (message.type) {
                    case "session.created":
                        console.log("session started with id:-->" + message.session.id);
                        break;
                    case "response.audio_transcript.delta":
                        break;
                    case "response.audio.delta":
                        yield receiveAudioForOutbound(message.delta);
                        break;
                    case "input_audio_buffer.speech_started":
                        console.log(`Voice activity detection started at ${message.audio_start_ms} ms`);
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
                        if (message.name === "escalate") {
                            const sourceCallerIdNumber = (yield acsClient.getCallConnection(conversationId).listParticipants()).values;
                            console.log(sourceCallerIdNumber);
                            yield acsClient
                                .getCallConnection(conversationId)
                                .getCallMedia()
                                .stopMediaStreaming({ operationContext: "stopMediaStreaming" });
                            try {
                                yield acsClient.getCallConnection(conversationId).addParticipant({
                                    targetParticipant: { phoneNumber: "+14032124840" },
                                    sourceDisplayName: "Jake",
                                    sourceCallIdNumber: {
                                        phoneNumber: "+14388140297",
                                    },
                                });
                            }
                            catch (e) {
                                console.log(e, e.message);
                            }
                        }
                        if (message.name === "send_summary") {
                            const httpsAgent = new https_1.default.Agent({
                                rejectUnauthorized: false,
                            });
                            const response = yield (0, node_fetch_1.default)("https://03f8d831c688efbd8b1974fd770e4c.f4.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/bcec5c21bc0d4795858e09b90a94d40b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=gNN65YHpNEZ78JXT47xhOVGayDr4A1Pt9attnfRZUy4", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify(Object.assign(Object.assign({}, JSON.parse(message.arguments)), { function: "send_summary" })),
                                agent: httpsAgent,
                            });
                            const data = yield response.json();
                            console.log(data);
                            if (data.success) {
                                yield realtimeStreaming.send(createConversationItem("Summary has been sent to your email, is there anything else I can help you with?", conversationId, "assistant"));
                                yield realtimeStreaming.send(createResponseMessage("Respond to the user that summary has been sent successfully. Be concise and friendly, ask the user if there is anything else that you can help with."));
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
                            const httpsAgent = new https_1.default.Agent({
                                rejectUnauthorized: false,
                            });
                            const response = yield (0, node_fetch_1.default)("https://03f8d831c688efbd8b1974fd770e4c.f4.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/bcec5c21bc0d4795858e09b90a94d40b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=gNN65YHpNEZ78JXT47xhOVGayDr4A1Pt9attnfRZUy4", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: message.arguments,
                                agent: httpsAgent,
                            });
                            const data = yield response.json();
                            console.log(data);
                            if (data.success) {
                                yield realtimeStreaming.send(createConversationItem("Appointment has been booked, is there anything else I can help you with?", conversationId, "assistant"));
                                yield realtimeStreaming.send(createResponseMessage("Respond to the user that appointment has been booked successfully. Be concise and friendly, ask the user if there is anything else that you can help with."));
                            }
                        }
                    case "conversation.item.created":
                        console.log("Conversation item created: ", message.type, message.event_id);
                    default:
                        break;
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
            }
            finally { if (e_1) throw e_1.error; }
        }
    });
}
function initWebsocket(socket) {
    return __awaiter(this, void 0, void 0, function* () {
        ws = socket;
    });
}
function stopAudio() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const jsonData = (0, communication_call_automation_1.createOutboundStopAudioData)();
            sendMessage(jsonData);
        }
        catch (e) {
            console.log(e);
        }
    });
}
function receiveAudioForOutbound(data) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const jsonData = (0, communication_call_automation_1.createOutboundAudioData)(data);
            sendMessage(jsonData);
        }
        catch (e) {
            console.log(e);
        }
    });
}
function sendMessage(data) {
    return __awaiter(this, void 0, void 0, function* () {
        if (ws.readyState === ws_1.default.OPEN) {
            ws.send(data);
        }
        else {
            console.log("socket connection is not open.");
        }
    });
}
