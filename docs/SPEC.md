# Especificação do Machine Airsoft

Operadores autenticados registram equipamentos de proteção, compras e manutenções para acompanhar o saldo das peças e o custo dos serviços.

## MVP

- Cadastrar equipamentos com código único e cadastrar peças com estoque mínimo.
- Registrar compras com fornecedor, data, quantidade inteira positiva e custo unitário não negativo.
- Abrir uma ordem por equipamento, adicionar peças com saldo suficiente e concluir a ordem.
- Consultar alertas de saldo, compras e peças usadas. O custo registrado na saída permanece no histórico.

## Regras e critérios de aceitação

- Cada operador vê apenas os próprios dados. Sem login, o painel solicita e-mail e senha.
- Campos de texto obrigatórios aceitam de 1 a 200 caracteres após remover espaços nas extremidades. Campos inválidos impedem o envio, e o banco também aplica os limites.
- Registrar uma compra aumenta o saldo. Consumir peças reduz o saldo na mesma transação que registra a saída. Uma baixa acima do saldo falha sem criar saída.
- O mesmo equipamento só pode ter uma ordem aberta. Depois de concluída, a ordem não aceita novas saídas.
- Compras e saídas compõem o histórico. A interface e as permissões do banco impedem alteração e exclusão diretas.
- Nomes e descrições fornecidos pelo operador aparecem como texto literal.
