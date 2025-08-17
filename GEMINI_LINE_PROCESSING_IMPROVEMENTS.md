# Mejoras de Procesamiento Línea por Línea para Gemini

## Problema Identificado

Aunque la extracción manual funcionaba correctamente, Gemini seguía capturando cantidades incorrectas porque:

1. **Texto fusionado**: El texto extraído del PDF perdía la estructura de líneas
2. **Prompt genérico**: Gemini procesaba todo el texto como una sola cadena
3. **Falta de contexto**: No había instrucciones claras sobre procesar línea por línea
4. **Validación insuficiente**: No se validaban las respuestas de Gemini adecuadamente

### Ejemplos de Problemas:
- **CPOV-000009605**: Debería ser **18 UND**, pero venía como **1 UND**
- **CPOV-000009797**: Debería ser **160 UND**, pero venía como **1160 UND**
- **CPOV-000009866**: Debería ser **150 UND**, pero venía como **1150 UND**

## Solución Implementada

### 1. **Mejora en Extracción de Texto del PDF**
- **Preservación de estructura**: Mejor agrupación por posición Y
- **Ordenamiento por coordenadas**: Líneas ordenadas por posición X dentro de cada Y
- **Redondeo inteligente**: Agrupación de líneas similares con precisión de 2 decimales

### 2. **Reconstrucción de Líneas**
- **Detección automática**: Identifica cuando el texto está fusionado
- **Patrón de inicio**: Usa `CG-\d+` para identificar inicios de línea
- **Fallback robusto**: Métodos alternativos si la reconstrucción falla

### 3. **Prompt Mejorado para Gemini**
- **Instrucciones específicas**: Procesar cada línea por separado
- **Contexto claro**: Cantidades deben estar en la misma línea que el artículo
- **Formato estructurado**: Líneas numeradas para mejor referencia
- **Validaciones explícitas**: Instrucciones para evitar mezclar cantidades

### 4. **Validación Post-Extracción**
- **Validación de campos**: Verifica que cada campo tenga valor
- **Validación de cantidades**: Rango y formato numérico
- **Validación cruzada**: Evita confundir números de orden con cantidades
- **Eliminación de duplicados**: Basado en combinación nombre:valor

## Código Implementado

### Extracción de Texto Mejorada
```javascript
// Método mejorado para preservar líneas
const textItems = textContent.items.map(item => ({
    text: item.str || '',
    x: item.transform[4],
    y: item.transform[5],
    width: item.width || 0
}));

// Agrupar por posición Y (líneas)
const lineGroups = {};
textItems.forEach(item => {
    const yKey = Math.round(item.y * 100) / 100; // Redondear para agrupar líneas similares
    if (!lineGroups[yKey]) {
        lineGroups[yKey] = [];
    }
    lineGroups[yKey].push(item);
});

// Ordenar líneas por posición Y (de arriba a abajo)
const sortedYKeys = Object.keys(lineGroups).sort((a, b) => parseFloat(b) - parseFloat(a));

// Construir líneas ordenadas por posición X dentro de cada línea
const lines = [];
sortedYKeys.forEach(yKey => {
    const lineItems = lineGroups[yKey].sort((a, b) => a.x - b.x);
    const lineText = lineItems.map(item => item.text).join(' ').trim();
    
    if (lineText.length > 0) {
        lines.push(lineText);
    }
});
```

### Reconstrucción de Líneas
```javascript
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
```

### Prompt Mejorado
```javascript
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
```

### Validación Post-Extracción
```javascript
// Validar y limpiar los campos extraídos
const validatedFields = [];
const seenCombinations = new Set();

parsedData.campos.forEach(field => {
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
```

## Resultados de las Pruebas

### Tasa de Éxito: 100%
- ✅ **Caso 1**: CPOV-000009605 → 18 UND (correcto)
- ✅ **Caso 2**: CPOV-000009797 → 160 UND (correcto)
- ✅ **Caso 3**: CPOV-000009866 → 150 UND (correcto)

### Logs de Debugging Mejorados
```
📄 Procesando 2 líneas para Gemini
📄 Líneas relevantes encontradas: 2
📄 Líneas relevantes:
1. CG-00014961 CPOV-000009605 TUBOS PVC SDR 21 6" X 19' CORVI-SONACA 18 UND
2. CG-00014961 CPOV-000009795 TUBOS PVC SCH 40 3/4" X 19' CORVI-SONACA 400 UND

✅ Campo validado: Cantidad = 18 (línea 1)
✅ Campo validado: Cantidad = 400 (línea 2)
📊 Total de campos validados: 2
```

## Beneficios

### 1. **Precisión Mejorada**
- Eliminación de fusiones incorrectas
- Captura correcta de cantidades por línea
- Validación robusta de cada campo

### 2. **Robustez**
- Funciona con texto bien estructurado y mal estructurado
- Reconstrucción automática de líneas
- Fallbacks múltiples

### 3. **Debugging Avanzado**
- Logs detallados por línea
- Información de número de línea en cada campo
- Trazabilidad completa del proceso

### 4. **Flexibilidad**
- Adaptable a diferentes formatos de PDF
- Procesamiento específico por tipo de documento
- Validaciones configurables

## Archivos Modificados

### `api/extract-ai.js`
- ✅ Mejorada extracción de texto del PDF
- ✅ Implementada reconstrucción de líneas
- ✅ Mejorado prompt de Gemini
- ✅ Agregada validación post-extracción

### `test-gemini-line-processing.js` (Nuevo)
- ✅ Pruebas específicas para casos problemáticos
- ✅ Simulación completa del proceso
- ✅ Verificación de precisión

## Monitoreo

### Logs a Revisar
```
📄 Procesando X líneas para Gemini
📄 Líneas relevantes encontradas: X
📄 Líneas relevantes:
1. [línea 1]
2. [línea 2]
...

✅ Campo validado: [campo] = [valor] (línea X)
📊 Total de campos validados: X
```

### Indicadores de Éxito
- ✅ Líneas se reconstruyen correctamente
- ✅ Gemini recibe líneas separadas
- ✅ Cantidades se extraen sin fusiones
- ✅ Validaciones pasan sin errores

## Próximos Pasos

1. **Desplegar** las mejoras en Vercel
2. **Probar** con documentos reales problemáticos
3. **Monitorear** los logs de Gemini
4. **Verificar** que las cantidades sean correctas

## Troubleshooting

### Si Gemini sigue capturando cantidades incorrectas
- Revisar los logs de líneas relevantes
- Verificar que el prompt se esté enviando correctamente
- Comprobar que las validaciones estén funcionando

### Si las líneas no se reconstruyen
- Verificar el patrón de inicio de línea
- Revisar el fallback de reconstrucción
- Ajustar la lógica de agrupación si es necesario

### Si faltan campos
- Revisar el filtrado de líneas relevantes
- Verificar las validaciones post-extracción
- Comprobar el formato de respuesta de Gemini
