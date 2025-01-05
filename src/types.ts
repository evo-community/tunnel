import { Request } from 'express';

export interface ApiRequest extends Request {
  body: any;
}
