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
Object.defineProperty(exports, "__esModule", { value: true });
exports.processWebsocketMessageAsync = processWebsocketMessageAsync;
const communication_call_automation_1 = require("@azure/communication-call-automation");
const azureOpenAiService_1 = require("./azureOpenAiService");
/* Parsing the received buffer data to streaming data */
function processWebsocketMessageAsync(receivedBuffer) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = communication_call_automation_1.StreamingData.parse(receivedBuffer);
        const kind = communication_call_automation_1.StreamingData.getStreamingKind();
        // Get the streaming data kind
        if (kind === "AudioData") {
            const audioData = result;
            if (!audioData.isSilent) {
                yield (0, azureOpenAiService_1.sendAudioToExternalAi)(audioData.data);
            }
        }
    });
}
