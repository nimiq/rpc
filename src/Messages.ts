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
}

export enum ResponseStatus {
    OK = 'ok',
    ERROR = 'error',
}
