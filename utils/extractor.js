import { GoogleGenerativeAI } from '@google/generative-ai';

// Configuración de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function extractWithAI(textoPlano, camposSolicitados) {
  try {
    console.log('🤖 Iniciando extracción con Gemini Flash...');
    
    if (!textoPlano || textoPlano.length === 0) {
      console.log('❌ Error: Texto vacío');
      return [];
    }
    
    if (!process.env.GEMINI_API_KEY) {
      console.log('❌ Error: API key no configurada');
      return [];
    }
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8000
      }
    });
    
    const prompt = `Extrae estos campos: ${camposSolicitados.join(', ')}

Documento: ${textoPlano.substring(0, 15000)}

Responde SOLO con JSON en este formato:
{"campos": [{"nombre": "campo", "valor": "valor"}]}`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiResponse = response.text();
    
    // Limpiar respuesta
    let cleanResponse = aiResponse;
    if (aiResponse.includes('```json')) {
      cleanResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    }
    
    // Parsear JSON
    const firstBrace = cleanResponse.indexOf('{');
    const lastBrace = cleanResponse.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1) {
      const jsonString = cleanResponse.substring(firstBrace, lastBrace + 1);
      const parsedData = JSON.parse(jsonString);
      
      if (parsedData.campos && Array.isArray(parsedData.campos)) {
        console.log(`✅ Gemini extrajo ${parsedData.campos.length} campos`);
        return parsedData.campos;
      }
    }
    
    console.log('⚠️ Fallback a extracción manual');
    return extractFieldsManually(textoPlano, camposSolicitados);
    
  } catch (error) {
    console.error('❌ Error en Gemini:', error.message);
    return extractFieldsManually(textoPlano, camposSolicitados);
  }
}

function extractFieldsManually(textoPlano, camposSolicitados) {
  console.log('🔍 Iniciando extracción manual...');
  const resultados = [];

  for (const campo of camposSolicitados) {
    let valor = 'No encontrado';
    
    // Patrones específicos para cada tipo de campo
    if (campo.toLowerCase().includes('número de orden') || campo.toLowerCase().includes('numero de orden')) {
      const match = textoPlano.match(/CPOV-\d+|CAOV-\d+/i);
      if (match) valor = match[0];
    } else if (campo.toLowerCase().includes('id de carga')) {
      const match = textoPlano.match(/CG-\d+/i);
      if (match) valor = match[0];
    } else if (campo.toLowerCase().includes('código de artículo') || campo.toLowerCase().includes('codigo de articulo')) {
      const match = textoPlano.match(/\d{3}-\d{4}|P\d{4}|\d{6}-\d{3}/i);
      if (match) valor = match[0];
    } else if (campo.toLowerCase().includes('cantidad')) {
      const match = textoPlano.match(/\d+\s+UND/i);
      if (match) valor = match[0];
    } else {
      // Patrón genérico
      const regex = new RegExp(`${campo}\\s*[:\\-]?\\s*(.+)`, 'i');
      const match = textoPlano.match(regex);
      if (match) valor = match[1].trim();
    }

    resultados.push({
      nombre: campo,
      valor: valor,
    });
  }

  console.log(`📊 Extracción manual: ${resultados.length} campos`);
  return resultados;
}
