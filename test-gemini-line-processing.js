const fs = require('fs');

// Simular los casos problemáticos mencionados
const problematicCases = [
    {
        name: "CPOV-000009605 - Debería ser 18 UND, pero viene como 1 UND",
        text: `CG-00014961 CPOV-000009605 TUBOS PVC SDR 21 6" X 19' CORVI-SONACA 18 UND CG-00014961 CPOV-000009795 TUBOS PVC SCH 40 3/4" X 19' CORVI-SONACA 400 UND`,
        expectedQuantity: "18"
    },
    {
        name: "CPOV-000009797 - Debería ser 160 UND, pero viene como 1160 UND",
        text: `CG-00014961 CPOV-000009797 TUBOS PVC SDR 41 2" X 19' CORVI-SONACA 160 UND CG-00014961 CPOV-000009866 TUBOS PVC SCH 40 1 1/2" X 19' CORVI-SONACA 1150 UND`,
        expectedQuantity: "160"
    },
    {
        name: "CPOV-000009866 - Debería ser 150 UND, pero viene como 1150 UND",
        text: `CG-00014961 CPOV-000009866 TUBOS PVC SCH 40 1 1/2" X 19' CORVI-SONACA 150 UND CG-00014961 CPOV-000009911 TUBOS PVC SDR 32.5 8" X 19'J/G CORVI-SONACA 3 UND`,
        expectedQuantity: "150"
    }
];

// Función para simular el procesamiento línea por línea
function simulateLineProcessing(text) {
    console.log('🔍 Simulando procesamiento línea por línea...');
    
    // Función para reconstruir líneas si el texto está fusionado
    function reconstructLines(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        
        // Si hay pocas líneas, intentar reconstruir basándose en patrones
        if (lines.length < 5) {
            console.log('⚠️ Pocas líneas detectadas, intentando reconstruir...');
            
            // Buscar patrones de inicio de línea
            const lineStartPattern = /(CG-\d+)/g;
            const matches = [...text.matchAll(lineStartPattern)];
            
            if (matches.length > 0) {
                const reconstructedLines = [];
                for (let i = 0; i < matches.length; i++) {
                    const startIndex = matches[i].index;
                    const endIndex = i < matches.length - 1 ? matches[i + 1].index : text.length;
                    const line = text.substring(startIndex, endIndex).trim();
                    
                    if (line.length > 10) {
                        reconstructedLines.push(line);
                    }
                }
                
                if (reconstructedLines.length > 0) {
                    console.log(`✅ Reconstruidas ${reconstructedLines.length} líneas`);
                    return reconstructedLines;
                }
            }
        }
        
        return lines;
    }
    
    // Procesar el texto línea por línea
    const lines = reconstructLines(text);
    console.log(`📄 Procesando ${lines.length} líneas`);
    
    // Filtrar solo líneas relevantes
    const relevantLines = lines.filter(line => 
        line.includes('TUBOS PVC') || 
        line.includes('CORVI-SONACA') || 
        line.includes('CPOV-') || 
        line.includes('CG-')
    );
    
    console.log(`📄 Líneas relevantes encontradas: ${relevantLines.length}`);
    
    // Simular el prompt que se enviaría a Gemini
    const prompt = `Extrae los siguientes campos del documento, procesando CADA LÍNEA POR SEPARADO:

- ID de carga (formato: CG-XXXXXXX)
- Número de orden (formato: CPOV-XXXXXXXXX)
- Nombre de artículo (debe contener "TUBOS PVC" y "CORVI-SONACA")
- Cantidad (solo números que estén en la MISMA LÍNEA que el artículo, seguidos de "UND")

IMPORTANTE:
1. Procesa cada línea individualmente
2. La cantidad debe estar en la MISMA LÍNEA que el nombre del artículo
3. NO mezcles cantidades de líneas diferentes
4. Solo considera cantidades que estén claramente asociadas al artículo en esa línea específica
5. Si una línea no tiene cantidad clara, omítela

Documento (cada línea separada):
${relevantLines.map((line, index) => `Línea ${index + 1}: ${line}`).join('\n')}

Responde SOLO con un JSON en este formato:
{"campos": [{"nombre": "campo", "valor": "valor", "linea": numero_linea}]}`;

    console.log('\n📝 Prompt que se enviaría a Gemini:');
    console.log('='.repeat(80));
    console.log(prompt);
    console.log('='.repeat(80));
    
    return {
        lines: relevantLines,
        prompt: prompt,
        totalLines: relevantLines.length
    };
}

// Función para simular la validación de campos
function simulateFieldValidation(fields, relevantLines) {
    console.log('\n🔍 Simulando validación de campos...');
    
    const validatedFields = [];
    const seenCombinations = new Set();
    
    fields.forEach(field => {
        const fieldName = field.nombre || field.label || '';
        const fieldValue = field.valor || field.value || '';
        const lineNumber = field.linea || field.line || 0;
        
        // Validar que el campo tenga valor
        if (!fieldValue || fieldValue.trim() === '') {
            console.log(`⚠️ Campo vacío ignorado: ${fieldName}`);
            return;
        }
        
        // Para cantidades, aplicar validaciones adicionales
        if (fieldName.toLowerCase().includes('cantidad')) {
            const numericMatch = fieldValue.match(/(\d+)/);
            if (!numericMatch) {
                console.log(`⚠️ Cantidad inválida ignorada: ${fieldValue}`);
                return;
            }
            
            const numericValue = parseInt(numericMatch[1]);
            
            // Validar que la cantidad sea razonable
            if (numericValue <= 0 || numericValue > 99999) {
                console.log(`⚠️ Cantidad fuera de rango ignorada: ${fieldValue}`);
                return;
            }
            
            // Verificar que no sea parte de un número de orden
            if (numericValue > 500) {
                const originalLine = relevantLines[lineNumber - 1] || '';
                if (originalLine.includes('CPOV-')) {
                    const orderMatch = originalLine.match(/CPOV-(\d+)/);
                    if (orderMatch && orderMatch[1].includes(numericValue.toString())) {
                        console.log(`⚠️ Cantidad parece ser número de orden ignorada: ${fieldValue}`);
                        return;
                    }
                }
            }
        }
        
        // Evitar duplicados basándose en nombre y valor
        const combination = `${fieldName}:${fieldValue}`;
        if (seenCombinations.has(combination)) {
            console.log(`⚠️ Campo duplicado ignorado: ${fieldName} = ${fieldValue}`);
            return;
        }
        seenCombinations.add(combination);
        
        validatedFields.push({
            nombre: fieldName,
            valor: fieldValue,
            linea: lineNumber
        });
        
        console.log(`✅ Campo validado: ${fieldName} = ${fieldValue} (línea ${lineNumber})`);
    });
    
    console.log(`📊 Total de campos validados: ${validatedFields.length}`);
    return validatedFields;
}

// Función para simular la extracción manual como fallback
function simulateManualExtraction(text) {
    console.log('\n🔍 Simulando extracción manual como fallback...');
    
    const results = [];
    const foundQuantities = new Set();
    
    // Procesar el texto línea por línea
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    
    // Si hay pocas líneas, intentar reconstruir
    if (lines.length < 5) {
        const lineStartPattern = /(CG-\d+)/g;
        const matches = [...text.matchAll(lineStartPattern)];
        
        if (matches.length > 0) {
            const reconstructedLines = [];
            for (let i = 0; i < matches.length; i++) {
                const startIndex = matches[i].index;
                const endIndex = i < matches.length - 1 ? matches[i + 1].index : text.length;
                const line = text.substring(startIndex, endIndex).trim();
                
                if (line.length > 10) {
                    reconstructedLines.push(line);
                }
            }
            
            if (reconstructedLines.length > 0) {
                lines.length = 0;
                lines.push(...reconstructedLines);
            }
        }
    }
    
    // Patrón específico para cantidades con word boundaries
    const quantityPattern = /\b(\d{1,4})\s*UND\b/gi;
    
    lines.forEach((line, lineIndex) => {
        if (line.includes('TUBOS PVC') || line.includes('CORVI-SONACA')) {
            console.log(`🔍 Procesando línea ${lineIndex + 1}: "${line}"`);
            
            const matches = line.match(quantityPattern);
            if (matches) {
                console.log(`✅ Línea ${lineIndex + 1} - Cantidades encontradas:`, matches);
                
                matches.forEach(match => {
                    const numericMatch = match.match(/(\d+)/);
                    if (numericMatch) {
                        const quantity = numericMatch[1];
                        const numericValue = parseInt(quantity);
                        
                        // Validación cruzada
                        if (numericValue > 500) {
                            if (line.includes('CPOV-')) {
                                const orderMatch = line.match(/CPOV-(\d+)/);
                                if (orderMatch && orderMatch[1].includes(quantity)) {
                                    console.log(`⚠️ Cantidad rechazada (parece ser número de orden): "${quantity}" en línea ${lineIndex + 1}`);
                                    return;
                                }
                            }
                        }
                        
                        if (!foundQuantities.has(quantity)) {
                            foundQuantities.add(quantity);
                            results.push({ 
                                nombre: 'Cantidad', 
                                valor: quantity,
                                linea: lineIndex + 1
                            });
                            console.log(`✅ Cantidad agregada: "${quantity}" (línea ${lineIndex + 1})`);
                        }
                    }
                });
            }
        }
    });
    
    return results;
}

function testProblematicCases() {
    console.log('🧪 Probando casos problemáticos específicos...\n');
    
    problematicCases.forEach((testCase, index) => {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`CASO ${index + 1}: ${testCase.name}`);
        console.log(`${'='.repeat(80)}`);
        
        console.log(`📄 Texto de entrada: "${testCase.text}"`);
        console.log(`🎯 Cantidad esperada: ${testCase.expectedQuantity}`);
        
        // Simular procesamiento línea por línea
        const lineProcessing = simulateLineProcessing(testCase.text);
        
        // Simular extracción manual
        const manualResults = simulateManualExtraction(testCase.text);
        
        // Buscar la cantidad extraída
        const extractedQuantity = manualResults.find(r => r.nombre === 'Cantidad');
        
        if (extractedQuantity) {
            console.log(`\n📊 RESULTADO:`);
            console.log(`✅ Cantidad extraída: ${extractedQuantity.valor}`);
            console.log(`🎯 Cantidad esperada: ${testCase.expectedQuantity}`);
            
            if (extractedQuantity.valor === testCase.expectedQuantity) {
                console.log(`✅ ÉXITO: Cantidad correcta`);
            } else {
                console.log(`❌ ERROR: Cantidad incorrecta`);
                console.log(`🔍 Análisis de la línea: "${lineProcessing.lines[extractedQuantity.linea - 1]}"`);
            }
        } else {
            console.log(`\n❌ ERROR: No se encontró cantidad`);
        }
        
        console.log(`\n📋 Líneas procesadas:`);
        lineProcessing.lines.forEach((line, lineIndex) => {
            console.log(`${lineIndex + 1}. ${line}`);
        });
    });
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 RESUMEN DE RESULTADOS');
    console.log(`${'='.repeat(80)}`);
    
    let successCount = 0;
    problematicCases.forEach((testCase, index) => {
        const manualResults = simulateManualExtraction(testCase.text);
        const extractedQuantity = manualResults.find(r => r.nombre === 'Cantidad');
        
        if (extractedQuantity && extractedQuantity.valor === testCase.expectedQuantity) {
            successCount++;
            console.log(`✅ Caso ${index + 1}: ÉXITO`);
        } else {
            console.log(`❌ Caso ${index + 1}: FALLO`);
        }
    });
    
    const successRate = (successCount / problematicCases.length * 100).toFixed(1);
    console.log(`\n📊 Tasa de éxito: ${successRate}% (${successCount}/${problematicCases.length})`);
}

// Ejecutar si se llama directamente
if (require.main === module) {
    testProblematicCases();
}

module.exports = { 
    simulateLineProcessing, 
    simulateFieldValidation, 
    simulateManualExtraction, 
    testProblematicCases 
};
