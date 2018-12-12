interface Message {
    origin: string;
    data: object;
}

export interface ResponseMessage extends Message {
    data: {
        id: number,
        status: ResponseStatus,
        result: any,
    };
}

export interface PostMessage extends Message {
    source: string;
}

export interface RedirectRequest {
    origin: string;
    data: {
        id: number,
        command: string,
        args: any[],
    };
    returnURL: string;
    source: MessagePort|Window|ServiceWorker|string|null;
}

export enum ResponseStatus {
    OK = 'ok',
    ERROR = 'error',
}

export const POSTMESSAGE_RETURN_URL = '<postMessage>';
