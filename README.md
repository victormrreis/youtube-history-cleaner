# YouTube History Cleaner (YHC) 🧹

Adiciona um botão Limpar histórico ao menu lateral do YouTube e apaga seu histórico em segundo plano, sem abrir abas.

![Versão](https://img.shields.io/badge/vers%C3%A3o-3.0.0-blue.svg)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-green.svg)
![Tampermonkey](https://img.shields.io/badge/Tampermonkey-suportado-black?logo=tampermonkey)
![Navegadores](https://img.shields.io/badge/navegadores-Microsoft%20Edge%20%7C%20Chrome-blue)

---

## ✨ Recursos

- **Item nativo "Limpar histórico" no menu lateral**: posicionado logo abaixo de "Downloads" (e disponível também no menu recolhido).
- **Janela de confirmação no tema escuro do YouTube**: visual consistente com aviso de irreversibilidade e caixa de confirmação obrigatória para evitar ações acidentais.
- **Dois modos de exclusão**:
  - **Histórico completo**: exibição + pesquisa em todo o período.
  - **Apenas visualizações**: mantém o histórico de buscas intacto.
- **Execução invisível**: nenhuma aba, iframe ou extensão extra; a limpeza leva cerca de 1–2 segundos.

---

## 🚀 Instalação

1. Instale a extensão **Tampermonkey** (ou Tampermonkey Beta) no seu navegador (Microsoft Edge ou Google Chrome).
2. No Microsoft Edge: acesse `edge://extensions` → ative o **Modo de desenvolvedor** (necessário para userscripts no Manifest V3). Nos detalhes do Tampermonkey, ative **"Permitir scripts de usuário"**, se a opção estiver disponível.
3. Clique no link direto de instalação:  
   👉 **[Instalar youtube-history-cleaner.user.js](https://raw.githubusercontent.com/victormrreis/youtube-history-cleaner/main/youtube-history-cleaner.user.js)**
4. Na primeira exclusão, o Tampermonkey solicitará permissão para acessar `myactivity.google.com` → selecione **Sempre permitir este domínio**.

---

## ⚙️ Como funciona

- **Injeção no menu**: o item de menu é um elemento próprio estilizado e inserido após a entrada `/feed/downloads` (a clonagem de componentes Polymer nativos do YouTube gera elementos vazios, por isso elementos próprios são utilizados).
- **Histórico completo**: o script obtém o token anti-CSRF diretamente da página do *Google Minha Atividade* e envia a mesma requisição interna disparada pelo botão "Excluir tudo" do produto YouTube (RPC `TmdDAd`), via `GM_xmlhttpRequest`.
- **Apenas visualizações**: utiliza a API interna do YouTube (`/youtubei/v1/feedback`), correspondendo ao mesmo comando acionado pelo botão nativo "Limpar todo o histórico de exibição".

---

## ⚠️ Limitações

- **Não existe modo "apenas pesquisas"**: o Google descontinuou esse filtro em sua plataforma.
- **APIs internas**: utiliza chamadas internas não documentadas do Google e YouTube. Caso ocorra alteração na estrutura dessas chamadas, o script interrompe o processo, exibe uma mensagem de erro em vermelho e não realiza exclusões parciais.
- **Irreversível**: a exclusão do histórico é permanente e não pode ser desfeita.

---

## 🔒 Privacidade

O script executa exclusivamente no seu navegador local. Não envia dados para terceiros ou servidores externos e comunica-se apenas com `youtube.com` e `myactivity.google.com`, utilizando a sua própria sessão ativa autenticada.

---

## ⚖️ Aviso legal

Este é um projeto independente e não oficial, sem qualquer vínculo com o Google LLC ou YouTube. O uso deste software é por sua conta e risco.

---

## 📄 Licença

Este projeto é distribuído sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE) para obter mais informações.
