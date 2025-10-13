export interface ConnectionSettings {
  uri: URL;
  protocols?: string[];
  headers?: Record<string, string>;
}
