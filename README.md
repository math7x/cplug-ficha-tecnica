# CPlug - Ficha Técnica

Conjunto de extensões para diagnosticar e sincronizar custos de fichas técnicas no ConnectPlug. O projeto separa o fluxo de análise do processo de atualização, facilitando a conferência antes de qualquer alteração.

## Componentes

- `diagnostico`: identifica inconsistências e ajuda a validar os dados exibidos pelo sistema;
- `sincronizador`: permite escolher, produto a produto, entre preservar a ficha atual ou recalcular o custo;
- testes automatizados para as regras centrais, integração com a página e interface.

## Destaques técnicos

- Manifest V3;
- comunicação entre scripts de conteúdo, página e background;
- processamento tolerante a falhas, sem interromper o lote por causa de um item bloqueado;
- persistência local de estado;
- testes em JavaScript para os principais fluxos.

## Estrutura

```text
diagnostico/    extensão de apoio e inspeção
sincronizador/  extensão principal e testes
```

## Instalação

1. Abra `chrome://extensions` ou `brave://extensions`.
2. Ative o modo do desenvolvedor.
3. Clique em **Carregar sem compactação**.
4. Selecione `sincronizador` para o uso principal ou `diagnostico` para o utilitário de inspeção.

Tecnologias principais: JavaScript, HTML, CSS e Chrome Extensions API.

## Autoria

Desenvolvido por [math7x](https://github.com/math7x).
