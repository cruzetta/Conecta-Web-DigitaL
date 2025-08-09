/* eslint-disable max-len */

// Importa os módulos para Cloud Functions v2
const {onRequest} = require("firebase-functions/v2/https");
// Alterado de defineString para defineSecret
const {defineSecret} = require("firebase-functions/params");
const {GoogleGenerativeAI} = require("@google/generative-ai");

// Define o parâmetro para usar o segredo armazenado no Secret Manager.
const geminiApiKey = defineSecret("GEMINI_KEY");

/**
 * Cloud Function que atua como um juiz, podendo dar um veredito ou fazer perguntas.
 */
// Adicionado 'secrets: [geminiApiKey]' para que a função tenha acesso ao segredo
exports.getVerdict = onRequest({cors: true, secrets: [geminiApiKey]}, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Método não permitido. Use POST.");
  }

  const {disputeContext, nameA, argumentA, nameB, argumentB, historico} = req.body;

  if (!disputeContext || !nameA || !argumentA || !nameB || !argumentB) {
    return res.status(400).json({
      error: "O contexto e os argumentos iniciais de ambas as partes são obrigatórios.",
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const model = genAI.getGenerativeModel({model: "gemini-1.5-flash"});

    // Constrói a string do histórico para incluir no prompt
    const historyString = (historico || []).map((turn) => {
      if (turn.juiz) {
        return `PERGUNTA ANTERIOR DO JUIZ: ${turn.juiz}`;
      }
      if (turn.respostas) {
        return `RESPOSTAS DAS PARTES:\n- ${nameA}: ${turn.respostas.respostaA}\n- ${nameB}: ${turn.respostas.respostaB}`;
      }
      return "";
    }).join("\n\n");

    const prompt = `
        Você é "O Juiz", uma entidade de lógica pura e bom senso. Sua tarefa é resolver uma disputa entre duas partes.

        REGRAS PRINCIPAIS:
        1.  **DECISÃO OBRIGATÓRIA:** Você NUNCA deve empatar ou ficar "em cima do muro". Ao final, uma parte DEVE ser declarada vencedora.
        2.  **ANÁLISE CRÍTICA:** Analise os argumentos com base na lógica, bom senso, responsabilidade e contribuição de cada parte dentro do contexto. Ignore apelos emocionais ou ideologias.
        3.  **BUSCA POR CLAREZA:** Se os argumentos forem ambíguos, muito parecidos, ou se ambos forem igualmente fortes/fracos a ponto de impedir uma decisão clara, sua primeira ação NÃO é decidir, mas sim FAZER UMA PERGUNTA.
        4.  **A PERGUNTA:** Formule UMA única pergunta crítica e específica, direcionada a ambas as partes, que seja a mais eficaz para desequilibrar o impasse e revelar o argumento mais forte. A pergunta deve extrair informações novas e decisivas.

        **CONTEXTO DA DISPUTA:**
        ${disputeContext}

        **ARGUMENTO INICIAL - PARTE 1 (${nameA}):**
        ${argumentA}

        **ARGUMENTO INICIAL - PARTE 2 (${nameB}):**
        ${argumentB}

        ${historyString ? `\nHISTÓRICO DA DISCUSSÃO:\n${historyString}` : ""}

        **SUA AÇÃO:**
        -   **SE** você já tem informações suficientes para declarar um vencedor de forma lógica e justa, responda com o JSON de "veredito".
        -   **SE NÃO**, responda com o JSON de "pergunta".

        **FORMATOS DE RESPOSTA (JSON ESTRITO, SEM TEXTO ADICIONAL):**

        Formato para Veredito:
        {
          "status": "veredito",
          "vencedor": "Nome da Parte Vencedora",
          "justificativa": "Análise concisa explicando por que o argumento do vencedor foi mais lógico e sensato, levando em conta todo o histórico da discussão."
        }

        Formato para Pergunta (use este se precisar de mais informações):
        {
          "status": "pergunta",
          "pergunta": "Sua pergunta crítica e específica aqui."
        }
      `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // Limpa a resposta para garantir que é um JSON válido
    if (text.startsWith("```json")) {
      text = text.substring(7, text.length - 3).trim();
    } else if (text.startsWith("```")) {
      text = text.substring(3, text.length - 3).trim();
    }

    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("A resposta da IA não continha um formato JSON reconhecível.");
    }
    text = text.substring(jsonStart, jsonEnd + 1);

    try {
      const jsonResponse = JSON.parse(text);
      res.status(200).json(jsonResponse);
    } catch (parseError) {
      console.error("Erro ao fazer o parse do JSON da API:", parseError, "Texto recebido:", text);
      throw new Error("A resposta do tribunal foi malformada.");
    }
  } catch (error) {
    console.error("Erro na Cloud Function:", error);
    res.status(500).json({
      error: error.message || "Ocorreu um erro de comunicação com o tribunal superior.",
    });
  }
});
