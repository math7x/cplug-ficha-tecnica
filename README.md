# Sincronizador de custos das fichas técnicas do CPlug

Extensão para Brave que automatiza a atualização do custo de produtos produzidos a partir dos custos atuais de seus insumos no CPlug.

## O que este projeto faz

Este projeto cria uma ligação automática entre três etapas que hoje ficam separadas no CPlug:

1. a entrada de um insumo altera seu custo;
2. a ficha técnica do produto precisa recalcular o custo de cada componente;
3. o novo total da ficha precisa ser copiado para o custo fixo do cadastro do produto.

O objetivo é manter o custo do produto produzido coerente com o valor atual de seus insumos, reduzindo trabalho manual e evitando que decisões sejam tomadas com um custo antigo.

```mermaid
flowchart LR
    A[Entrada do insumo] --> B[Atualização do custo do insumo]
    B --> C[Recálculo dos componentes da ficha]
    C --> D[Novo custo total da ficha]
    D --> E[Atualização do custo fixo do produto]
    E --> F[Conferência do valor gravado]
```

## A dificuldade que a extensão resolve

Quando uma compra, movimentação de estoque ou nota fiscal muda o custo de um insumo, o CPlug não conclui sozinho todo o processo de atualização do produto que usa esse insumo.

Sem a extensão, é necessário:

- descobrir quais fichas técnicas usam o insumo alterado;
- abrir cada ficha técnica;
- clicar nos três pontos de cada componente;
- escolher **Recalcular custo**;
- salvar a ficha;
- anotar ou copiar o novo custo total;
- abrir o cadastro do produto correspondente;
- acessar a aba **Estoque**;
- substituir manualmente o **Valor do custo**;
- salvar e conferir se a alteração foi gravada.

Além de repetitivo, esse processo facilita esquecimentos. A ficha pode mostrar um custo e o cadastro do produto continuar com outro, prejudicando a análise de margem, a formação de preço e o acompanhamento do resultado real.

## O que passa a ser automático

| Etapa | Antes | Com a extensão |
|---|---|---|
| Detectar uma entrada | Acompanhamento manual | A extensão reconhece entradas concluídas |
| Atualizar componentes | Um clique por componente | Os componentes são recalculados pela própria rotina |
| Atualizar a ficha | Abertura e salvamento manual | A ficha é salva depois do recálculo |
| Atualizar o produto | Copiar e digitar o total manualmente | O total é gravado no custo fixo do produto |
| Validar o resultado | Conferência manual em várias telas | A extensão reabre e confere o valor gravado |

A extensão preserva o preço de venda. Ela atua no custo usado para representar quanto o produto custa, sem aplicar automaticamente o preço sugerido.

## Formas de uso

### Conferir diferenças

Faz uma simulação e mostra os produtos cujo custo da ficha técnica difere do custo fixo do cadastro. Essa opção serve para revisar a situação antes de gravar qualquer alteração.

### Sincronizar agora

Executa imediatamente o processo completo:

1. recalcula os componentes;
2. salva a ficha técnica;
3. lê novamente o custo total;
4. atualiza o custo fixo no cadastro do produto;
5. reabre o produto e confirma o valor salvo.

### Sincronizar após entradas no CPlug

Mantém um monitor ativo enquanto o CPlug estiver aberto no Brave. Depois de uma entrada concluída, a extensão inicia a sincronização automaticamente.

O monitor foi pensado para os dois fluxos usados na operação:

- movimentação ou entrada manual de estoque;
- importação de nota fiscal ou XML.

Ações rejeitadas ou entradas que não foram concluídas não devem iniciar uma sincronização.

## Como usar

1. Abra `brave://extensions`.
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta da extensão.
4. Abra o CPlug e selecione a empresa autorizada para validação.
5. Clique no ícone da extensão.
6. Use **Conferir diferenças** para simular ou **Sincronizar agora** para salvar.
7. Para o funcionamento contínuo, marque **Sincronizar após entradas no CPlug**.

Durante uma sincronização, as abas de trabalho podem aparecer em primeiro plano. Isso permite que os controles do CPlug sejam carregados corretamente. Aguarde a conclusão e evite trocar de aba enquanto a rotina estiver executando.

## Situação atual do projeto

A versão atual está em validação controlada na empresa **MATHEUS**. Essa restrição evita alterações acidentais em bases de produção durante os testes.

O fluxo já validado inclui:

- leitura das fichas técnicas;
- recálculo dos componentes pelo comando do próprio CPlug;
- salvamento da ficha;
- leitura do novo custo total;
- atualização do custo fixo do produto;
- reabertura e conferência do valor salvo;
- detecção de entradas manuais e importações bem-sucedidas;
- fechamento automático do aviso inicial de boas-vindas do CPlug.

Em um teste com o produto **PÃO FRANCÊS TESTE**, o custo da ficha foi recalculado de **R$ 5,90** para **R$ 53,31**, e o custo fixo do cadastro foi atualizado e conferido em **R$ 53,31**.

## Regras e limitações atuais

- A empresa selecionada deve ser **MATHEUS** durante a fase de validação.
- Produtos compartilhados com outras empresas são ignorados para evitar alterações fora da base de teste.
- Produtos configurados sem custo fixo são ignorados.
- O Brave e o CPlug precisam permanecer abertos para o modo automático funcionar.
- Alterações na interface do CPlug podem exigir ajustes na extensão.
- É recomendável conferir o histórico exibido no painel após cada execução.

## Privacidade

A extensão não precisa armazenar usuário ou senha. A automação usa a sessão já aberta no CPlug.

O histórico local pode registrar dados operacionais necessários à conferência, como nome e identificador do produto, valores encontrados e resultado da execução.

## Resultado esperado

O ganho principal não é apenas economizar cliques. A extensão reduz o intervalo entre a mudança do custo do insumo e a atualização do produto produzido. Com isso, o cadastro fica mais próximo do custo real da operação e exige menos conferência manual da equipe.

Este projeto transforma uma sequência repetitiva e sujeita a falhas em um fluxo único, rastreável e verificável.
