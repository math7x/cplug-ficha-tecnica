# Diagnóstico de custos CPlug

Esta é uma ferramenta de diagnóstico. A sincronização automática ainda não está implementada.

1. No Brave, abra `brave://extensions` e ative o modo de desenvolvedor.
2. Clique em **Carregar sem compactação** e selecione esta pasta `diagnostico`.
3. Antes de recarregar o CPlug, resolva eventuais alterações não salvas. A ficha do PÃO FRANCÊS indicava alterações pendentes durante a inspeção.
4. Recarregue o CPlug e abra a lista de fichas técnicas, uma ficha e seu cadastro de produto na aba Estoque.
5. Durante seu trabalho normal, conclua uma entrada manual e uma entrada por nota/XML. Para mapear a gravação de custo, use uma correção real que você já precise fazer no cadastro. Não crie entradas fictícias só para o diagnóstico.
6. Clique no ícone da extensão e em **Exportar diagnóstico**. Envie o arquivo `diagnostico-cplug-custos.json` nesta conversa.
7. Desative a extensão ao terminar a coleta.

O registro é local e limitado. Contém caminho da operação, horário, método, status e tipos dos campos. Não grava cabeçalhos, valores dos campos JSON ou valores dos parâmetros de consulta. IDs numéricos dos caminhos são substituídos por marcadores. Nomes de campos e segmentos textuais das rotas permanecem no relatório.

A ferramenta observa chamadas fetch e XMLHttpRequest a rotas relacionadas a produtos e estoque. Não cria chamadas ao servidor e não altera as respostas usadas pelo CPlug. A compatibilidade com a extensão de balança ainda precisa ser validada no navegador. Se houver problema, desative o diagnóstico e recarregue a página.
