const fs = require('fs');
const path = require('path');

// Simular las funciones mejoradas para testing
function validateQuantity(quantity, context = '') {
    try {
        // Limpiar la cantidad
        const cleanQuantity = quantity.toString().trim();
        
        // Extraer solo números
        const numericMatch = cleanQuantity.match(/(\d+)/);
        if (!numericMatch) {
            console.log(`⚠️ Cantidad inválida (sin números): "${quantity}"`);
            return null;
        }
        
        const numericValue = parseInt(numericMatch[1]);
        
        // Validaciones
        if (numericValue <= 0) {
            console.log(`⚠️ Cantidad inválida (≤ 0): "${quantity}"`);
            return null;
        }
        
        if (numericValue > 99999) {
            console.log(`⚠️ Cantidad sospechosa (muy alta): "${quantity}"`);
            return null;
        }
        
        // Verificar contexto si está disponible
        if (context) {
            const contextLower = context.toLowerCase();
            
            // Si el contexto sugiere que es una cantidad válida
            if (contextLower.includes('und') || 
                contextLower.includes('unidades') || 
                contextLower.includes('pcs') || 
                contextLower.includes('piezas') ||
                contextLower.includes('cantidad')) {
                console.log(`✅ Cantidad validada con contexto: "${quantity}" -> ${numericValue}`);
                return numericValue.toString();
            }
        }
        
        // Si no hay contexto, ser más estricto
        if (numericValue >= 1 && numericValue <= 9999) {
            console.log(`✅ Cantidad validada: "${quantity}" -> ${numericValue}`);
            return numericValue.toString();
        }
        
        console.log(`⚠️ Cantidad fuera de rango razonable: "${quantity}"`);
        return null;
        
    } catch (error) {
        console.log(`❌ Error validando cantidad "${quantity}":`, error.message);
        return null;
    }
}

function testQuantityExtraction() {
    console.log('🧪 Probando extracción mejorada de cantidades...\n');
    
    // Texto de prueba basado en el documento real
    const testText = `
    CG-00014961 CPOV-000009605 TUBOS PVC SDR 21 6" X 19' CORVI-SONACA 1 UND
    CG-00014961 CPOV-000009795 TUBOS PVC SCH 40 3/4" X 19' CORVI-SONACA 1400 UND
    CG-00014961 CPOV-000009797 TUBOS PVC SDR 41 2" X 19' CORVI-SONACA 1160 UND
    CG-00014961 CPOV-000009866 TUBOS PVC SCH 40 1 1/2" X 19' CORVI-SONACA 1150 UND
    CG-00014961 CPOV-000009911 TUBOS PVC SDR 32.5 8" X 19'J/G CORVI-SONACA 3 UND
    CG-00014961 CPOV-000009911 TUBOS PVC SDR 32.5 8" X 19'J/G CORVI-SONACA 5 UND
    CG-00014961 CPOV-000009911 TUBOS PVC SDR 32.5 8" X 19'J/G CORVI-SONACA 15 UND
    CG-00014961 CPOV-000009911 TUBOS PVC SDR 32.5 8" X 19'J/G CORVI-SONACA 15 UND
    CG-00014961 CPOV-000009927 TUBOS PVC SCH 40 6" X 19' CORVI-SONACA 40 UND
    CG-00014961 CPOV-000009968 TUBOS PVC DRENAJE 2" X 19' 40 UND
    CG-00014961 CPOV-000009970 TUBOS PVC SCH 40 1 1/2" X 19' CORVI-SONACA 200 UND
    CG-00014961 CPOV-000009970 TUBOS PVC SDR 41 6" X 19' CORVI-SONACA 40 UND
    `;
    
    console.log('📄 Texto de prueba:');
    console.log('='.repeat(80));
    console.log(testText);
    console.log('='.repeat(80));
    
    // Patrones mejorados para cantidades
    const quantityPatterns = [
        {
            pattern: /(\d+)\s+(?:UND|UNIDADES|PCS|PIEZAS)/gi,
            name: 'Cantidad con unidades',
            context: true
        },
        {
            pattern: /(?:Cantidad|Quantity)[:\s]*(\d+)/gi,
            name: 'Cantidad con etiqueta',
            context: true
        },
        {
            pattern: /(?<=[A-Z\s])(\d{1,4})\s+(?:UND|UNIDADES|PCS|PIEZAS)(?=\s|$)/gi,
            name: 'Cantidad en contexto de tabla',
            context: true
        },
        {
            pattern: /(?<=[A-Z\s\d\/\"\-\'\.]+SONACA[^\d]*)(\d{1,4})(?=\s|$)/gi,
            name: 'Cantidad después de artículo SONACA',
            context: true
        }
    ];
    
    const foundQuantities = new Set();
    const results = [];
    
    console.log('\n🔍 Probando patrones mejorados...\n');
    
    quantityPatterns.forEach(({ pattern, name, context }) => {
        console.log(`🔍 Probando patrón: ${name}`);
        const matches = testText.match(pattern);
        if (matches) {
            console.log(`✅ ${name} - Encontrados:`, matches);
            matches.forEach(match => {
                // Extraer solo el número del match
                const numericMatch = match.match(/(\d+)/);
                if (numericMatch) {
                    const quantity = numericMatch[1];
                    
                    // Obtener contexto alrededor del match
                    const matchIndex = testText.indexOf(match);
                    const contextStart = Math.max(0, matchIndex - 50);
                    const contextEnd = Math.min(testText.length, matchIndex + match.length + 50);
                    const surroundingContext = testText.substring(contextStart, contextEnd);
                    
                    // Validar la cantidad con contexto
                    const validatedQuantity = validateQuantity(quantity, surroundingContext);
                    
                    if (validatedQuantity && !foundQuantities.has(validatedQuantity)) {
                        foundQuantities.add(validatedQuantity);
                        results.push({ 
                            nombre: 'Cantidad', 
                            valor: validatedQuantity,
                            context: surroundingContext.trim()
                        });
                        console.log(`✅ Cantidad agregada: "${validatedQuantity}" (${name})`);
                        console.log(`📄 Contexto: "${surroundingContext.trim()}"`);
                    } else if (!validatedQuantity) {
                        console.log(`⚠️ Cantidad rechazada: "${quantity}" (${name})`);
                    }
                }
            });
        } else {
            console.log(`❌ ${name} - No se encontraron matches`);
        }
        console.log('');
    });
    
    console.log('📊 Resultados finales:');
    console.log('='.repeat(80));
    console.log(`Total de cantidades únicas encontradas: ${foundQuantities.size}`);
    console.log(`Cantidades:`, Array.from(foundQuantities).sort((a, b) => parseInt(a) - parseInt(b)));
    console.log('');
    console.log('📋 Detalles de cada cantidad:');
    results.forEach((result, index) => {
        console.log(`${index + 1}. Cantidad: "${result.valor}"`);
        console.log(`   Contexto: "${result.context}"`);
        console.log('');
    });
    
    // Verificar que las cantidades esperadas estén presentes
    const expectedQuantities = ['1', '3', '5', '15', '40', '200', '1150', '1160', '1400'];
    const missingQuantities = expectedQuantities.filter(q => !foundQuantities.has(q));
    const extraQuantities = Array.from(foundQuantities).filter(q => !expectedQuantities.includes(q));
    
    console.log('✅ Verificación de cantidades esperadas:');
    if (missingQuantities.length === 0) {
        console.log('✅ Todas las cantidades esperadas fueron encontradas');
    } else {
        console.log(`❌ Cantidades faltantes: ${missingQuantities.join(', ')}`);
    }
    
    if (extraQuantities.length === 0) {
        console.log('✅ No se encontraron cantidades extra');
    } else {
        console.log(`⚠️ Cantidades extra encontradas: ${extraQuantities.join(', ')}`);
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    testQuantityExtraction();
}

module.exports = { testQuantityExtraction, validateQuantity };
