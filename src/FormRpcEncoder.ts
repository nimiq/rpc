import { ResponseStatus } from './Messages';
import { JSONUtils } from './JSONUtils';
import { State } from './State';

export class FormRpcEncoder {
    public static prepareFormReply(state: State, status: ResponseStatus, result: any): HTMLFormElement {
        const $form = document.createElement('form');
        $form.setAttribute('method', 'post');
        $form.setAttribute('action', state.returnURL!);
        $form.style.display = 'none';

        const $statusInput = document.createElement('input');
        $statusInput.setAttribute('type', 'text');
        $statusInput.setAttribute('name', 'status');
        $statusInput.setAttribute('value', status);
        $form.appendChild($statusInput);

        const $resultInput = document.createElement('input');
        $resultInput.setAttribute('type', 'text');
        $resultInput.setAttribute('name', 'result');
        $resultInput.setAttribute('value', JSONUtils.stringify(result));
        $form.appendChild($resultInput);

        const $idInput = document.createElement('input');
        $idInput.setAttribute('type', 'text');
        $idInput.setAttribute('name', 'rpcId');
        $idInput.setAttribute('value', state.id.toString());
        $form.appendChild($idInput);
        document.body.appendChild($form);
        return $form;
    }
}
