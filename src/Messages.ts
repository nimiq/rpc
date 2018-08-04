interface Message {
    origin: string;
    data: object;
}

interface ResponseMessage extends Message {
    data: {
        id: number,
        status: ResponseStatus,
        result: any,
    };
}

interface PostMessage extends Message {
    source: string;
}

interface RedirectRequest {
    origin: string;
    data: {
        id: number,
        command: string,
        args: any[],
    };
    returnURL: string;
}

enum ResponseStatus {
    OK = 'ok',
    ERROR = 'error',
}
