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
    responseMethod?: ResponseMethod;
    source: MessagePort|Window|ServiceWorker|string|null;
}

export enum ResponseMethod {
    HTTP_POST = 'http-post',
    HTTP_GET = 'http-get',
    POST_MESSAGE = 'post-message',
}

export enum ResponseStatus {
    OK = 'ok',
    ERROR = 'error',
}
