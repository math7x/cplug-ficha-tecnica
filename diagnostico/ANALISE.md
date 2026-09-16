# Análise do diagnóstico recebido

O arquivo recebido contém 43 estruturas: 42 consultas GET com status 200 e um POST /api/v3/purchase-invoices com status 201. Esse POST confirma a criação de um registro de nota; isoladamente, não comprova a conclusão da entrada em estoque.

## Consultas confirmadas

- GET /api/v3/products: lista paginada em data.products; paginação em meta e links.
- GET /api/v3/products/:id: cadastro de produto; custo em stock_settings.cost.amount com currency e indicador is_fixed_cost.
- GET /api/v3/products/:id/compositions: composição em data.compositions; cada componente contém amount, component_id, disabled, is_optional, value e component.stock_settings.cost. Não há total calculado explícito nessa estrutura capturada.
- GET /api/v3/stocks/:id/products/:id/movements e /balance: consulta de movimentações e saldo.
- GET /api/v3/purchase-invoices/:id/items: itens da nota.

## O que ainda falta confirmar

- Método, rota e corpo da gravação do custo no cadastro.
- Operação que confirma uma entrada manual e a finalização da entrada por nota.
- Unidade monetária do campo amount, regras de arredondamento e cálculo do total exibido. O diagnóstico contém tipos, não valores, portanto não comprova esses detalhes.
- Contexto de empresa e autenticação para as operações automáticas. Credenciais não devem ser exportadas no diagnóstico.

## Correção na ferramenta

A versão 0.1 ignorava respostas sem JSON. A versão 0.2 registra status de respostas vazias, não JSON e acima do limite, além da estrutura de formulários sem seu conteúdo. A ausência das gravações no primeiro arquivo não permite concluir que o usuário não as executou.

## Coleta complementar

Atualize a extensão no Brave, recarregue o CPlug após resolver alterações pendentes e limpe o diagnóstico antigo pelo popup. Capture uma gravação real do campo Valor do custo e as conclusões de entradas manual e por XML durante o uso normal. Exporte o novo diagnóstico. Não faça lançamentos fictícios para coletar dados.
