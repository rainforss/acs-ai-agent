"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
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
exports.sendMessage = exports.WebSocket = void 0;
exports.getWebsocket = getWebsocket;
const ws_1 = require("ws");
exports.WebSocket = ws_1.WebSocket;
const sendMessage = (socket, message) => {
    return new Promise((resolve, reject) => {
        socket.send(message, (error) => {
            if (error) {
                console.log("Send message error", error.name, error.stack);
                reject(error);
            }
            else {
                resolve();
            }
        });
    });
};
exports.sendMessage = sendMessage;
function getWebsocket(settings) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return new exports.WebSocket(settings.uri, settings.protocols, {
                headers: settings.headers,
            });
        }
        catch (error) {
            console.log("Web socket error", error);
        }
    });
}
