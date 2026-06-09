declare module 'cloudflare:sockets' {
  export interface SocketAddress {
    hostname: string;
    port: number;
  }

  export interface SocketOptions {
    allowHalfOpen?: boolean;
    secureTransport?: 'off' | 'on' | 'starttls';
  }

  export interface Socket {
    close(): void;
    readable: ReadableStream<Uint8Array>;
    startTls(): Socket;
    writable: WritableStream<Uint8Array>;
  }

  export function connect(address: SocketAddress | string, options?: SocketOptions): Socket;
}
