import { v4 as uuidv4 } from "uuid";
import { ConnectionSettings } from "./interface";
import {
  ConnectionClosedMessage,
  ServerMessageType,
  UserMessageType,
} from "./models";
import {
  ValidateProtocolMessage,
  validationError,
  WebSocketClient,
} from "./websocket-client";

export class VoiceLiveClient {
  public requestId: string | undefined;
  private client: WebSocketClient<UserMessageType, ServerMessageType>;
  private getWebsocket(
    settings: ConnectionSettings
  ): WebSocketClient<UserMessageType, ServerMessageType> {
    const handler = {
      validate: (event: any): any => {
        if (typeof event.data !== "string") {
          return validationError<ServerMessageType>(
            new Error("Invalid message type")
          );
        }
        try {
          const data = JSON.parse(event.data as string);

          return validationError<ServerMessageType>(
            new Error("Invalid message type")
          );
        } catch (error) {
          return validationError<ServerMessageType>(
            new Error("Invalid JSON message")
          );
        }
      },
      serialize: (message: UserMessageType) => JSON.stringify(message),
      createClosedMessage: (_event: any): ServerMessageType =>
        ({
          type: "connection.closed",
          event_id: uuidv4(),
          code: _event.code,
          reason: _event.reason,
        } as ConnectionClosedMessage),
    };

    return new WebSocketClient<UserMessageType, ServerMessageType>(
      settings,
      handler
    );
  }

  constructor(uri: URL, apiKey: string) {
    console.log(uri, apiKey);
    this.client = this.getWebsocket({ uri, headers: { "api-key": apiKey } });
  }

  async *messages(): AsyncIterable<ServerMessageType> {
    for await (const message of this.client) {
      yield message;
    }
  }

  async send(message: UserMessageType): Promise<void> {
    try {
      await this.client.send(message);
    } catch (error) {
      console.log(error);
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
