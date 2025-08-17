const fs = require('fs');

// Simular el texto extraído problemático de Vercel (sin saltos de línea)
const problematicText = `CG-00014961 CPOV-000009605 TUBOS PVC SDR 21 6" X 19' CORVI-SONACA 1 UND CG-00014961 CPOV-000009795 TUBOS PVC SCH 40 3/4" X 19' CORVI-SONACA 400 UND CG-00014961 CPOV-000009797 TUBOS PVC SDR 41 2" X 19' CORVI-SONACA 1160 UND CG-00014961 CPOV-000009866 TUBOS PVC SCH 40 1 1/2" X 19' CORVI-SONACA 1150 UND CG-00014961 CPOV-000009911 TUBOS PVC SDR 32.5 8" X 19'J/G CORVI-SONACA 3 UND CG-00014961 CPOV-000009911 TUBOS PVC SDR 32.5 8" X 19'J/G CORVI-SONACA 5 UND CG-00014961 CPOV-000009911 TUBOS PVC SDR 32.5 8" X 19'J/G CORVI-SONACA 18 UND CG-00014961 CPOV-000009911 TUBOS PVC SDR 32.5 8" X 19'J/G CORVI-SONACA 15 UND CG-00014961 CPOV-000009927 TUBOS PVC SCH 40 6" X 19' CORVI-SONACA 40 UND CG-00014961 CPOV-000009968 TUBOS PVC DRENAJE 2" X 19' 40 UND CG-00014961 CPOV-000009970 TUBOS PVC SCH 40 1 1/2" X 19' CORVI-SONACA 200 UND CG-00014961 CPOV-000009970 TUBOS PVC SDR 41 6" X 19' CORVI-SONACA 40 UND`;

// Texto correcto con saltos de línea (como debería ser)
const correctText = `CG-00014961 CPOV-000009605 TUBOS PVC SDR 21 6" X 19' CORVI-SONACA 1 UND
CG-00014961 CPOV-000009795 TUBOS PVC SCH 40 3/4" X 19' CORVI-SONACA 400 UND
CG-00014961 CPOV-000009797 TUBOS PVC SDR 41 2" X 19' CORVI-SONACA 1160 UND
CG-00014961 CPOV-000009866 TUBOS PVC SCH 40 1 1/2" X 19' CORVI-SONACA 1150 UND
CG-00014961 CPOV-000009911 TUBOS PVC SDR 32.5 8" X 19'J/G CORVI-SONACA 3 UND
CG-00014961 CPOV-000009911 TUBOS PVC SDR 32.5 8" X 19'J/G CORVI-SONACA 5 UND
CG-00014961 CPOV-000009911 TUBOS PVC SDR 32.5 8" X 19'J/G CORVI-SONACA 18 UND
CG-00014961 CPOV-000009911 TUBOS PVC SDR 32.5 8" X 19'J/G CORVI-SONACA 15 UND
CG-00014961 CPOV-000009927 TUBOS PVC SCH 40 6" X 19' CORVI-SONACA 40 UND
CG-00014961 CPOV-000009968 TUBOS PVC DRENAJE 2" X 19' 40 UND
CG-00014961 CPOV-000009970 TUBOS PVC SCH 40 1 1/2" X 19' CORVI-SONACA 200 UND
CG-00014961 CPOV-000009970 TUBOS PVC SDR 41 6" X 19' CORVI-SONACA 40 UND`;

function validateQuantity(quantity, context = '') {
    try {
        const cleanQuantity = quantity.toString().trim();
        const numericMatch = cleanQuantity.match(/(\d+)/);
        if (!numericMatch) {
            return null;
        }
        
        const numericValue = parseInt(numericMatch[1]);
        
        if (numericValue <= 0 || numericValue > 99999) {
            return null;
        }
        
        if (context) {
            const contextLower = context.toLowerCase();
            if (contextLower.includes('und') || 
                contextLower.includes('unidades') || 
                contextLower.includes('pcs') || 
                contextLower.includes('piezas') ||
                contextLower.includes('cantidad')) {
                return numericValue.toString();
            }
        }
        
        if (numericValue >= 1 && numericValue <= 9999) {
            return numericValue.toString();
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

function extractQuantitiesWithLineProcessing(text) {
    console.log('🔍 Iniciando extracción con procesamiento línea por línea...');
    
    // Intentar reconstruir las líneas basándose en patrones conocidos
    const reconstructedLines = [];
    
    // Patrón para identificar el inicio de una nueva línea
    const lineStartPattern = /(CG-\d+)/g;
    const matches = [...text.matchAll(lineStartPattern)];
    
    console.log(`📄 Encontrados ${matches.length} posibles inicios de línea`);
    
    // Reconstruir líneas basándose en los inicios encontrados
    for (let i = 0; i < matches.length; i++) {
        const startIndex = matches[i].index;
        const endIndex = i < matches.length - 1 ? matches[i + 1].index : text.length;
        const line = text.substring(startIndex, endIndex).trim();
        
        if (line.length > 10) { // Línea mínima válida
            reconstructedLines.push(line);
            console.log(`📄 Línea ${i + 1}: "${line}"`);
        }
    }
    
    // Si no se pudieron reconstruir líneas, usar el método original
    if (reconstructedLines.length === 0) {
        console.log('⚠️ No se pudieron reconstruir líneas, usando método alternativo...');
        // Dividir por patrones de artículos
        const articlePattern = /(TUBOS PVC[^C]*?)(?=TUBOS PVC|CG-|$)/gi;
        const articleMatches = [...text.matchAll(articlePattern)];
        
        articleMatches.forEach((match, index) => {
            const line = match[0].trim();
            if (line.length > 10) {
                reconstructedLines.push(line);
                console.log(`📄 Línea alternativa ${index + 1}: "${line}"`);
            }
        });
    }
    
    console.log(`📄 Total de líneas reconstruidas: ${reconstructedLines.length}`);
    
    const foundQuantities = new Set();
    const quantityResults = [];
    
    // Patrón específico para cantidades con word boundaries
    const quantityPattern = /\b(\d{1,4})\s*UND\b/gi;
    
    reconstructedLines.forEach((line, lineIndex) => {
        // Solo procesar líneas que contengan "TUBOS PVC" para asegurar contexto correcto
        if (line.includes('TUBOS PVC') || line.includes('CORVI-SONACA')) {
            console.log(`🔍 Procesando línea ${lineIndex + 1}: "${line}"`);
            
            // Buscar cantidades en esta línea específica
            const matches = line.match(quantityPattern);
            if (matches) {
                console.log(`✅ Línea ${lineIndex + 1} - Cantidades encontradas:`, matches);
                
                matches.forEach(match => {
                    const numericMatch = match.match(/(\d+)/);
                    if (numericMatch) {
                        const quantity = numericMatch[1];
                        const numericValue = parseInt(quantity);
                        
                        // Validación cruzada para evitar confundir número de orden con cantidad
                        if (numericValue > 500) {
                            // Verificar que no sea un número de orden (CPOV-)
                            if (line.includes('CPOV-')) {
                                const orderMatch = line.match(/CPOV-(\d+)/);
                                if (orderMatch && orderMatch[1].includes(quantity)) {
                                    console.log(`⚠️ Cantidad rechazada (parece ser número de orden): "${quantity}" en línea ${lineIndex + 1}`);
                                    return;
                                }
                            }
                            
                            // Verificar que esté claramente junto al nombre del artículo
                            const articleContext = line.includes('CORVI-SONACA') || line.includes('TUBOS PVC');
                            if (!articleContext) {
                                console.log(`⚠️ Cantidad rechazada (sin contexto de artículo): "${quantity}" en línea ${lineIndex + 1}`);
                                return;
                            }
                        }
                        
                        // Validación adicional: verificar que no esté en el contexto de un número de orden
                        const beforeQuantity = line.substring(0, line.indexOf(match));
                        const afterQuantity = line.substring(line.indexOf(match) + match.length);
                        
                        // Si hay un CPOV- cerca, verificar que no sea parte del número de orden
                        if (beforeQuantity.includes('CPOV-')) {
                            const orderInBefore = beforeQuantity.match(/CPOV-(\d+)/);
                            if (orderInBefore && orderInBefore[1].endsWith(quantity)) {
                                console.log(`⚠️ Cantidad rechazada (parte de número de orden): "${quantity}" en línea ${lineIndex + 1}`);
                                return;
                            }
                        }
                        
                        // Validar la cantidad con contexto completo de la línea
                        const validatedQuantity = validateQuantity(quantity, line);
                        
                        if (validatedQuantity && !foundQuantities.has(validatedQuantity)) {
                            foundQuantities.add(validatedQuantity);
                            quantityResults.push({ 
                                valor: validatedQuantity,
                                context: line,
                                lineNumber: lineIndex + 1
                            });
                            console.log(`✅ Cantidad agregada: "${validatedQuantity}" (línea ${lineIndex + 1})`);
                        } else if (!validatedQuantity) {
                            console.log(`⚠️ Cantidad rechazada por validación: "${quantity}" en línea ${lineIndex + 1}`);
                        } else {
                            console.log(`⚠️ Cantidad duplicada: "${quantity}" en línea ${lineIndex + 1}`);
                        }
                    }
                });
            } else {
                console.log(`❌ Línea ${lineIndex + 1} - No se encontraron cantidades`);
            }
        } else {
            console.log(`⏭️ Línea ${lineIndex + 1} - Saltada (sin contexto de TUBOS PVC)`);
        }
    });
    
    return {
        quantities: Array.from(foundQuantities).sort((a, b) => parseInt(a) - parseInt(b)),
        details: quantityResults,
        totalLines: reconstructedLines.length
    };
}

function testBothScenarios() {
    console.log('🧪 Probando extracción con texto problemático (sin saltos de línea)...\n');
    console.log('='.repeat(80));
    
    const problematicResult = extractQuantitiesWithLineProcessing(problematicText);
    
    console.log('\n📊 Resultados con texto problemático:');
    console.log(`Total de líneas procesadas: ${problematicResult.totalLines}`);
    console.log(`Cantidades encontradas: ${problematicResult.quantities.join(', ')}`);
    console.log(`Total de cantidades: ${problematicResult.quantities.length}`);
    
    console.log('\n📋 Detalles de cantidades:');
    problematicResult.details.forEach((detail, index) => {
        console.log(`${index + 1}. Cantidad: "${detail.valor}" (línea ${detail.lineNumber})`);
        console.log(`   Contexto: "${detail.context}"`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('🧪 Probando extracción con texto correcto (con saltos de línea)...\n');
    
    const correctResult = extractQuantitiesWithLineProcessing(correctText);
    
    console.log('\n📊 Resultados con texto correcto:');
    console.log(`Total de líneas procesadas: ${correctResult.totalLines}`);
    console.log(`Cantidades encontradas: ${correctResult.quantities.join(', ')}`);
    console.log(`Total de cantidades: ${correctResult.quantities.length}`);
    
    console.log('\n📋 Detalles de cantidades:');
    correctResult.details.forEach((detail, index) => {
        console.log(`${index + 1}. Cantidad: "${detail.valor}" (línea ${detail.lineNumber})`);
        console.log(`   Contexto: "${detail.context}"`);
    });
    
    // Comparación de resultados
    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPARACIÓN DE RESULTADOS:');
    
    const expectedQuantities = ['1', '3', '5', '15', '18', '40', '200', '400', '1150', '1160'];
    
    console.log(`Cantidades esperadas: ${expectedQuantities.join(', ')}`);
    console.log(`Cantidades encontradas (problemático): ${problematicResult.quantities.join(', ')}`);
    console.log(`Cantidades encontradas (correcto): ${correctResult.quantities.join(', ')}`);
    
    const problematicMissing = expectedQuantities.filter(q => !problematicResult.quantities.includes(q));
    const problematicExtra = problematicResult.quantities.filter(q => !expectedQuantities.includes(q));
    
    const correctMissing = expectedQuantities.filter(q => !correctResult.quantities.includes(q));
    const correctExtra = correctResult.quantities.filter(q => !expectedQuantities.includes(q));
    
    console.log('\n📊 Análisis de precisión:');
    console.log(`Texto problemático - Faltantes: ${problematicMissing.join(', ') || 'Ninguna'}`);
    console.log(`Texto problemático - Extras: ${problematicExtra.join(', ') || 'Ninguna'}`);
    console.log(`Texto correcto - Faltantes: ${correctMissing.join(', ') || 'Ninguna'}`);
    console.log(`Texto correcto - Extras: ${correctExtra.join(', ') || 'Ninguna'}`);
    
    const problematicAccuracy = ((expectedQuantities.length - problematicMissing.length - problematicExtra.length) / expectedQuantities.length * 100).toFixed(1);
    const correctAccuracy = ((expectedQuantities.length - correctMissing.length - correctExtra.length) / expectedQuantities.length * 100).toFixed(1);
    
    console.log(`\n📊 Precisión: Texto problemático: ${problematicAccuracy}%, Texto correcto: ${correctAccuracy}%`);
}

// Ejecutar si se llama directamente
if (require.main === module) {
    testBothScenarios();
}

module.exports = { extractQuantitiesWithLineProcessing, testBothScenarios };
