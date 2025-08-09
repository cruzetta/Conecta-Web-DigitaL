/* eslint-disable max-len */

// Importa os módulos para Cloud Functions v2
const {onRequest} = require("firebase-functions/v2/https");
const {defineString} = require("firebase-functions/params");
const {GoogleGenerativeAI} = require("@google/generative-ai");

// Define o parâmetro para a chave da API de forma segura.
const geminiApiKey = defineString("GEMINI_KEY");

/**
 * Define a Cloud Function 'getVerdict' que será acionada por uma requisição HTTP.
 * A opção {cors: true} instrui o Firebase a lidar com as requisições CORS automaticamente.
 */
exports.getVerdict = onRequest({cors: true}, async (req, res) => {
  // A verificação de método continua a ser uma boa prática.
  if (req.method !== "POST") {
    res.status(405).send("Método não permitido. Use POST.");
    return;
  }

  // Extrai os dados da disputa do corpo da requisição.
  const {disputeContext, nameA, argumentA, nameB, argumentB} = req.body;

  // Valida se todos os campos necessários foram fornecidos.
  if (!disputeContext || !nameA || !argumentA || !nameB || !argumentB) {
    res.status(400).json({
      error: "Erro no processo! O contexto e os argumentos de ambas as partes devem ser preenchidos.",
    });
    return;
  }

  try {
    // Inicializa o cliente da API do Gemini com a chave do parâmetro.
    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const model = genAI.getGenerativeModel({model: "gemini-1.5-flash"});

    // Monta o prompt para a IA, instruindo-a a agir como um juiz lógico.
    const prompt = `
        Sua única função é atuar como um juiz de **bom senso** e **lógica pura**. Você deve ignorar completamente qualquer ideologia, doutrina social ou apelo emocional. Sua decisão deve ser a conclusão mais pragmática e lógica que uma pessoa razoável e imparcial chegaria ao analisar os fatos. Avalie as contribuições e responsabilidades de cada parte, conforme descrito, e determine a solução mais sensata e equilibrada para o problema apresentado.

        **Contexto da Disputa:**
        ${disputeContext}

        **Argumento da Parte 1 (Nome: ${nameA}):**
        ${argumentA}

        **Argumento da Parte 2 (Nome: ${nameB}):**
        ${argumentB}

        Com base nesta análise estritamente lógica e de bom senso, tome uma decisão definitiva e forneça uma justificativa concisa e bem fundamentada para sua escolha.

        Responda estritamente no seguinte formato JSON, sem nenhum texto, comentários ou formatação adicional. O nome do vencedor deve ser exatamente como fornecido ('${nameA}' ou '${nameB}').

        {
          "vencedor": "Nome da Parte Vencedora",
          "justificativa": "Sua análise e o motivo da decisão, explicando qual argumento é mais lógico e sensato, considerando as contribuições de cada um dentro do contexto fornecido."
        }
      `;

    // Gera o conteúdo usando a API do Gemini.
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // Limpa a resposta para garantir que é um JSON válido, removendo o wrapper de markdown.
    if (text.startsWith("```json")) {
      text = text.substring(7, text.length - 3).trim();
    } else if (text.startsWith("```")) {
      text = text.substring(3, text.length - 3).trim();
    }

    // Tenta fazer o parse do texto limpo e envia o objeto JSON.
    try {
      const jsonResponse = JSON.parse(text);
      res.status(200).json(jsonResponse);
    } catch (parseError) {
      console.error("Erro ao fazer o parse do JSON da API:", parseError);
      console.error("Texto recebido da API que causou o erro:", text);
      throw new Error("A resposta do tribunal foi malformada.");
    }
  } catch (error) {
    console.error("Erro na Cloud Function:", error);
    res.status(500).json({
      error: error.message || "Ocorreu um erro de comunicação com o tribunal superior.",
    });
  }
});
