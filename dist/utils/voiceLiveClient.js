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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceLiveClient = void 0;
const uuid_1 = require("uuid");
const websocket_client_1 = require("./websocket-client");
const model_utils_1 = require("./model-utils");
class VoiceLiveClient {
    getWebsocket(settings) {
        const handler = {
            validate: (event) => {
                if (typeof event.data !== "string") {
                    return (0, websocket_client_1.validationError)(new Error("Invalid message type"));
                }
                try {
                    const data = JSON.parse(event.data);
                    if ((0, model_utils_1.isServerMessageType)(data)) {
                        return (0, websocket_client_1.validationSuccess)(data);
                    }
                    return (0, websocket_client_1.validationError)(new Error("Invalid message type"));
                }
                catch (error) {
                    return (0, websocket_client_1.validationError)(new Error("Invalid JSON message"));
                }
            },
            serialize: (message) => JSON.stringify(message),
            createClosedMessage: (_event) => ({
                type: "connection.closed",
                event_id: (0, uuid_1.v4)(),
                code: _event.code,
                reason: _event.reason,
            }),
        };
        return new websocket_client_1.WebSocketClient(settings, handler);
    }
    constructor(uri, apiKey) {
        this.client = this.getWebsocket({
            uri,
            headers: {
                "api-key": apiKey,
            },
        });
    }
    messages() {
        return __asyncGenerator(this, arguments, function* messages_1() {
            var _a, e_1, _b, _c;
            try {
                for (var _d = true, _e = __asyncValues(this.client), _f; _f = yield __await(_e.next()), _a = _f.done, !_a; _d = true) {
                    _c = _f.value;
                    _d = false;
                    const message = _c;
                    yield yield __await(message);
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                }
                finally { if (e_1) throw e_1.error; }
            }
        });
    }
    send(message) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.client.send(message);
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.client.close();
        });
    }
}
exports.VoiceLiveClient = VoiceLiveClient;
