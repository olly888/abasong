export type DataEnvelope = {
  format: string;
  keyId?: string;
  body: string[];
  wrapped: string[];
};
type Awaitable<T> = T | Promise<T>;
// Services always await these calls; the local adapter retains its D0 format.
export interface EnvelopeCrypto {
  readonly format: string;
  readonly keyId: string;
  readonly hmacVersion: string;
  hmacKey(label: string): Buffer;
  seal(value: unknown, aad: string): Awaitable<DataEnvelope>;
  open<T>(envelope: unknown, aad: string): Awaitable<T>;
}
