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
exports.WebSocketClient = exports.validationError = exports.validationSuccess = void 0;
const websocket_1 = require("./websocket");
const validationSuccess = (message) => ({
    success: true,
    message,
});
exports.validationSuccess = validationSuccess;
const validationError = (error) => ({
    success: false,
    error,
});
exports.validationError = validationError;
const isValidatorSuccess = (result) => result.success;
class WebSocketClient {
    constructor(settings, handler) {
        this.closedPromise = undefined;
        this.messageQueue = [];
        this.receiverQueue = [];
        this.done = false;
        this.validate = handler.validate;
        this.serialize = handler.serialize;
        this.createClosedMessage = handler.createClosedMessage;
        this.connectedPromise = new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            this.socket = yield (0, websocket_1.getWebsocket)(settings);
            console.log(this.socket.OPEN);
            this.socket.onopen = (e) => {
                console.log("Websocket open", e.type);
                this.socket.onmessage = this.getMessageHandler();
                this.closedPromise = new Promise((resolve) => {
                    this.socket.onclose = this.getClosedHandler(resolve);
                });
                this.socket.onerror = this.handleError;
                resolve();
            };
            this.socket.onerror = (event) => {
                console.log("Error event: ", event.message);
                this.error = event.error;
                reject(event);
            };
        }));
    }
    handleError(event) {
        this.error = event.error;
        while (this.receiverQueue.length > 0) {
            const [_, reject] = this.receiverQueue.shift();
            reject(event.error);
        }
    }
    getClosedHandler(closeResolve) {
        return (event) => {
            // If provided, enqueue a synthetic closed message for consumers
            if (this.createClosedMessage) {
                const closedMsg = this.createClosedMessage(event);
                console.log("Socket closed", event.reason);
                if (this.receiverQueue.length > 0) {
                    const [resolve, _] = this.receiverQueue.shift();
                    resolve({ value: closedMsg, done: false });
                }
                else {
                    this.messageQueue.push(closedMsg);
                }
            }
            this.done = true;
            while (this.receiverQueue.length > 0) {
                const [resolve, reject] = this.receiverQueue.shift();
                if (this.error) {
                    reject(this.error);
                }
                else {
                    resolve({ value: undefined, done: true });
                }
            }
            closeResolve();
        };
    }
    getMessageHandler() {
        const self = this;
        return (event) => {
            const result = self.validate(event);
            if (isValidatorSuccess(result)) {
                const { message } = result;
                if (self.receiverQueue.length > 0) {
                    const [resolve, _] = self.receiverQueue.shift();
                    resolve({ value: message, done: false });
                }
                else {
                    self.messageQueue.push(message);
                }
            }
            else {
                self.error = result.error;
                self.socket.close(1000, "Unexpected message received");
            }
        };
    }
    [Symbol.asyncIterator]() {
        return {
            next: () => {
                if (this.error) {
                    return Promise.reject(this.error);
                }
                else if (this.messageQueue.length > 0) {
                    const message = this.messageQueue.shift();
                    return Promise.resolve({ value: message, done: false });
                }
                else if (this.done) {
                    return Promise.resolve({ value: undefined, done: true });
                }
                else {
                    return new Promise((resolve, reject) => {
                        this.receiverQueue.push([resolve, reject]);
                    });
                }
            },
        };
    }
    send(message) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.connectedPromise;
            if (this.error) {
                throw this.error;
            }
            const serialized = this.serialize(message);
            return (0, websocket_1.sendMessage)(this.socket, serialized);
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.connectedPromise;
            if (this.done) {
                return;
            }
            this.socket.close();
            yield this.closedPromise;
        });
    }
}
exports.WebSocketClient = WebSocketClient;
