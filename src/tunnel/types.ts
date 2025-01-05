export interface TunnelRequest {
  type: 'request';
  id: string;
  method: string;
  path: string;
  headers: { [key: string]: string };
  body: any;
}

export interface TunnelResponse {
  type: 'response';
  id: string;
  statusCode: number;
  headers: { [key: string]: string };
  body: any;
}

export interface TunnelRegistration {
  type: 'register';
  subdomain: string;
  clientId: string;
}

export interface TunnelRegistrationResponse {
  type: 'register_response';
  success: boolean;
  message: string;
  url?: string;
}

export type TunnelMessage = 
  | TunnelRequest 
  | TunnelResponse 
  | TunnelRegistration 
  | TunnelRegistrationResponse;
