"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRandomValues = getRandomValues;
exports.generateId = generateId;
function getRandomValues(array) {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        return crypto.getRandomValues(array);
    }
    else if (typeof window !== "undefined" &&
        window.crypto &&
        window.crypto.getRandomValues) {
        return window.crypto.getRandomValues(array);
    }
    else {
        throw new Error("No secure random number generator available.");
    }
}
function generateId(prefix, length) {
    const array = new Uint8Array(length);
    getRandomValues(array);
    const base64 = btoa(String.fromCharCode(...array))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    return `${prefix}-${base64}`.slice(0, length);
}
