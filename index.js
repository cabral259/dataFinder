const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
const XLSX = require('xlsx');
const mammoth = require('mammoth');

class ExtractorDatos {
    constructor() {
        this.supportedFormats = {
            '.pdf': this.extractFromPDF,
            '.xlsx': this.extractFromExcel,
            '.xls': this.extractFromExcel,
            '.docx': this.extractFromWord,
            '.doc': this.extractFromWord,
            '.txt': this.extractFromText
        };
    }

    /**
     * Extrae datos de un archivo basándose en su extensión
     * @param {string} filePath - Ruta del archivo
     * @param {Object} options - Opciones de extracción
     * @returns {Promise<Object>} - Datos extraídos
     */
    async extractFromFile(filePath, options = {}) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            
            if (!this.supportedFormats[ext]) {
                throw new Error(`Formato no soportado: ${ext}`);
            }

            const extractor = this.supportedFormats[ext];
            const result = await extractor.call(this, filePath, options);
            
            return {
                success: true,
                fileName: path.basename(filePath),
                fileType: ext,
                data: result,
                extractedAt: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                fileName: path.basename(filePath),
                error: error.message,
                extractedAt: new Date().toISOString()
            };
        }
    }

    /**
     * Extrae texto de un archivo PDF con manejo inteligente de documentos grandes
     */
    async extractFromPDF(filePath, options = {}) {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            
            // Cargar el PDF usando pdfjs-dist con opciones mejoradas
            const loadingTask = pdfjsLib.getDocument({
                data: new Uint8Array(dataBuffer),
                disableFontFace: false,
                standardFontDataUrl: null
            });
            const pdf = await loadingTask.promise;
            
            const numPages = pdf.numPages;
            
            // Verificar límite de páginas (aumentado de 30 a 50)
            if (numPages > 50) {
                console.log(`⚠️ Documento muy grande (${numPages} páginas). Procesando solo las primeras 50 páginas...`);
            }
            
            const maxPages = Math.min(numPages, 50);
            
            // Función para procesar una página individual
            const processPage = async (pageNum) => {
                try {
                    console.log(`📄 Procesando página ${pageNum}/${maxPages}...`);
                    const page = await pdf.getPage(pageNum);
                    const textContent = await page.getTextContent();
                    
                    // Concatenar el texto de la página
                    const pageText = textContent.items
                        .map(item => item.str || '')
                        .join(' ');
                    
                    return pageText;
                } catch (pageError) {
                    console.log(`⚠️ Error en página ${pageNum}: ${pageError.message}`);
                    return '';
                }
            };
            
            // Procesar páginas en paralelo para mejor rendimiento
            console.log(`🚀 Procesando ${maxPages} páginas en paralelo...`);
            const pagePromises = [];
            for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
                pagePromises.push(processPage(pageNum));
            }
            
            // Usar Promise.allSettled para manejar errores individuales sin fallar todo el proceso
            const pageResults = await Promise.allSettled(pagePromises);
            const pageTexts = pageResults.map(result => {
                if (result.status === 'fulfilled') {
                    return result.value;
                } else {
                    console.log(`⚠️ Error procesando página: ${result.reason}`);
                    return '';
                }
            });
            
            // Unir todo el texto
            const extractedText = pageTexts.join('\n');
            let finalText = extractedText.trim();
            
            // Si se especifican campos específicos, filtrar el texto
            if (options.extractionType === 'specific' && options.specificFields && options.specificFields.length > 0) {
                finalText = this.filterTextByKeywords(finalText, options.specificFields);
            }
            
            return {
                text: finalText,
                pages: numPages,
                info: {},
                metadata: {}
            };
        } catch (error) {
            console.error('Error extrayendo PDF:', error.message);
            throw new Error(`Error al procesar PDF: ${error.message}`);
        }
    }

    /**
     * Extrae datos de un archivo Excel
     */
    async extractFromExcel(filePath, options = {}) {
        const workbook = XLSX.readFile(filePath);
        const result = {
            sheets: [],
            sheetNames: workbook.SheetNames
        };

        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            let filteredData = jsonData;
            
            // Si se especifican campos específicos, filtrar las columnas
            if (options.extractionType === 'specific' && options.specificFields && options.specificFields.length > 0) {
                filteredData = this.filterExcelByColumns(jsonData, options.specificFields);
            }
            
            result.sheets.push({
                name: sheetName,
                data: filteredData,
                rowCount: filteredData.length,
                columnCount: filteredData.length > 0 ? filteredData[0].length : 0
            });
        });

        return result;
    }

    /**
     * Extrae texto de un archivo Word
     */
    async extractFromWord(filePath, options = {}) {
        const result = await mammoth.extractRawText({ path: filePath });
        
        let finalText = result.value;
        
        // Si se especifican campos específicos, filtrar el texto
        if (options.extractionType === 'specific' && options.specificFields && options.specificFields.length > 0) {
            finalText = this.filterTextByKeywords(finalText, options.specificFields);
        }
        
        return {
            text: finalText,
            messages: result.messages
        };
    }
    
    /**
     * Extrae texto de un archivo de texto
     */
    async extractFromText(filePath, options = {}) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            
            let finalText = content;
            
            // Si se especifican campos específicos, filtrar el texto
            if (options.extractionType === 'specific' && options.specificFields && options.specificFields.length > 0) {
                finalText = this.filterTextByKeywords(finalText, options.specificFields);
            }
            
            return {
                text: finalText,
                messages: []
            };
        } catch (error) {
            throw new Error(`Error al leer archivo de texto: ${error.message}`);
        }
    }

    /**
     * Extrae datos de múltiples archivos
     */
    async extractFromMultipleFiles(filePaths, options = {}) {
        const results = [];
        
        for (const filePath of filePaths) {
            const result = await this.extractFromFile(filePath, options);
            results.push(result);
        }
        
        return results;
    }

    /**
     * Método alternativo para extraer PDF
     */
    async extractPDFAlternative(filePath, options = {}) {
        try {
            // Intentar con pdf-parse como respaldo
            const pdfParse = require('pdf-parse');
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            
            let extractedText = data.text || '';
            
            // Si se especifican campos específicos, filtrar el texto
            if (options.extractionType === 'specific' && options.specificFields && options.specificFields.length > 0) {
                extractedText = this.filterTextByKeywords(extractedText, options.specificFields);
            }
            
            return extractedText;
        } catch (error) {
            console.error('Error en método alternativo:', error.message);
            return 'No se pudo extraer texto del PDF. El archivo puede estar protegido, ser una imagen, o tener formato no estándar.';
        }
    }
    
    /**
     * Filtra texto por palabras clave con extracción inteligente mejorada
     */
    filterTextByKeywords(text, keywords) {
        if (!text || !keywords || keywords.length === 0) return text;
        
        const results = [];
        
        keywords.forEach(keyword => {
            const lowerKeyword = keyword.toLowerCase();
            
            // Patrones inteligentes mejorados
            if (lowerKeyword.includes('order') || lowerKeyword.includes('orden') || lowerKeyword.includes('número') || lowerKeyword.includes('numero')) {
                // Buscar números de orden con contexto
                const orderPatterns = [
                    /(?:order|orden|número|numero)\s*(?:number|número|numero)?\s*:?\s*(\d+)/gi,
                    /(?:order|orden)\s+(\d+)/gi,
                    /(?:número|numero)\s*:?\s*(\d+)/gi
                ];
                
                orderPatterns.forEach(pattern => {
                    const matches = text.match(pattern);
                    if (matches) {
                        results.push(...matches);
                    }
                });
                
                // Buscar líneas que contengan la palabra y números cercanos
                const lines = text.split('\n');
                lines.forEach(line => {
                    const lowerLine = line.toLowerCase();
                    if (lowerLine.includes(lowerKeyword)) {
                        // Extraer números de la línea
                        const numbers = line.match(/\d+/g);
                        if (numbers) {
                            results.push(`${line.trim()} (Números encontrados: ${numbers.join(', ')})`);
                        } else {
                            results.push(line.trim());
                        }
                    }
                });
                
            } else if (lowerKeyword.includes('email') || lowerKeyword.includes('correo')) {
                // Buscar emails con contexto
                const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const matches = text.match(emailPattern);
                if (matches) {
                    results.push(...matches);
                }
                
                // Buscar líneas con email
                const lines = text.split('\n');
                lines.forEach(line => {
                    if (line.includes('@')) {
                        results.push(line.trim());
                    }
                });
                
            } else if (lowerKeyword.includes('phone') || lowerKeyword.includes('teléfono') || lowerKeyword.includes('telefono')) {
                // Buscar teléfonos con diferentes formatos
                const phonePatterns = [
                    /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
                    /(\d{3})[-.\s]?(\d{3})[-.\s]?(\d{4})/g,
                    /(\d{3})[-.\s]?(\d{4})/g
                ];
                
                phonePatterns.forEach(pattern => {
                    const matches = text.match(pattern);
                    if (matches) {
                        results.push(...matches);
                    }
                });
                
            } else if (lowerKeyword.includes('price') || lowerKeyword.includes('precio') || lowerKeyword.includes('total') || lowerKeyword.includes('costo')) {
                // Buscar precios con diferentes formatos
                const pricePatterns = [
                    /\$?\d+(?:,\d{3})*(?:\.\d{2})?/g,
                    /\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:USD|EUR|GBP|dólares|euros)/gi,
                    /(?:total|precio|costo)\s*:?\s*\$?\d+(?:,\d{3})*(?:\.\d{2})?/gi
                ];
                
                pricePatterns.forEach(pattern => {
                    const matches = text.match(pattern);
                    if (matches) {
                        results.push(...matches);
                    }
                });
                
            } else if (lowerKeyword.includes('id') || lowerKeyword.includes('identificación') || lowerKeyword.includes('identificacion')) {
                // Buscar IDs con diferentes formatos
                const idPatterns = [
                    /(?:ID|id)\s*:?\s*(\d+)/gi,
                    /(?:identificación|identificacion)\s*:?\s*(\d+)/gi,
                    /(?:ID|id)\s*:?\s*([A-Z0-9]+)/gi
                ];
                
                idPatterns.forEach(pattern => {
                    const matches = text.match(pattern);
                    if (matches) {
                        results.push(...matches);
                    }
                });
                
            } else if (lowerKeyword.includes('fecha') || lowerKeyword.includes('date')) {
                // Buscar fechas
                const datePatterns = [
                    /\d{1,2}\/\d{1,2}\/\d{4}/g,
                    /\d{1,2}-\d{1,2}-\d{4}/g,
                    /\d{4}-\d{1,2}-\d{1,2}/g,
                    /(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{1,2},?\s+\d{4}/gi
                ];
                
                datePatterns.forEach(pattern => {
                    const matches = text.match(pattern);
                    if (matches) {
                        results.push(...matches);
                    }
                });
                
            } else {
                // Búsqueda inteligente por palabras clave con contexto
                const lines = text.split('\n');
                lines.forEach(line => {
                    const lowerLine = line.toLowerCase();
                    if (lowerLine.includes(lowerKeyword)) {
                        // Buscar números en la misma línea
                        const numbers = line.match(/\d+/g);
                        if (numbers) {
                            results.push(`${line.trim()} (Números: ${numbers.join(', ')})`);
                        } else {
                            results.push(line.trim());
                        }
                        
                        // Buscar en líneas cercanas (contexto)
                        const lineIndex = lines.indexOf(line);
                        for (let i = Math.max(0, lineIndex - 1); i <= Math.min(lines.length - 1, lineIndex + 1); i++) {
                            if (i !== lineIndex) {
                                const nearbyLine = lines[i];
                                const nearbyNumbers = nearbyLine.match(/\d+/g);
                                if (nearbyNumbers) {
                                    results.push(`Contexto: ${nearbyLine.trim()} (Números: ${nearbyNumbers.join(', ')})`);
                                }
                            }
                        }
                    }
                });
            }
        });
        
        // Eliminar duplicados y ordenar
        const uniqueResults = [...new Set(results)];
        return uniqueResults.join('\n');
    }
    
    /**
     * Filtra datos de Excel por columnas específicas
     */
    filterExcelByColumns(data, columnNames) {
        if (!data || data.length === 0 || !columnNames || columnNames.length === 0) {
            return data;
        }
        
        const headers = data[0] || [];
        const columnIndices = [];
        
        // Encontrar índices de las columnas especificadas
        columnNames.forEach(columnName => {
            const index = headers.findIndex(header => 
                header && header.toString().toLowerCase().includes(columnName.toLowerCase())
            );
            if (index !== -1) {
                columnIndices.push(index);
            }
        });
        
        // Si no se encontraron columnas específicas, buscar en todo el contenido
        if (columnIndices.length === 0) {
            console.log('🔍 No se encontraron columnas específicas, buscando en todo el contenido...');
            return this.filterExcelByContent(data, columnNames);
        }
        
        // Filtrar datos por columnas
        return data.map(row => {
            return columnIndices.map(index => row[index] || '');
        });
    }
    
    /**
     * Filtra datos de Excel por contenido en lugar de nombres de columnas
     */
    filterExcelByContent(data, keywords) {
        if (!data || data.length === 0 || !keywords || keywords.length === 0) {
            return data;
        }
        
        const filteredRows = [];
        
        // Buscar en todas las filas
        data.forEach((row, rowIndex) => {
            const rowText = row.join(' ').toLowerCase();
            const hasKeyword = keywords.some(keyword => 
                rowText.includes(keyword.toLowerCase())
            );
            
            if (hasKeyword) {
                // Marcar las celdas que contienen las palabras clave
                const markedRow = row.map(cell => {
                    const cellText = cell ? cell.toString() : '';
                    const lowerCellText = cellText.toLowerCase();
                    
                    // Verificar si la celda contiene alguna palabra clave
                    const matchingKeywords = keywords.filter(keyword => 
                        lowerCellText.includes(keyword.toLowerCase())
                    );
                    
                    if (matchingKeywords.length > 0) {
                        return `[${matchingKeywords.join(', ')}] ${cellText}`;
                    }
                    
                    return cellText;
                });
                
                filteredRows.push(markedRow);
            }
        });
        
        return filteredRows;
    }
    
    /**
     * Obtiene estadísticas de los datos extraídos
     */
    getExtractionStats(results) {
        const stats = {
            totalFiles: results.length,
            successful: 0,
            failed: 0,
            byType: {}
        };

        results.forEach(result => {
            if (result.success) {
                stats.successful++;
                
                if (!stats.byType[result.fileType]) {
                    stats.byType[result.fileType] = 0;
                }
                stats.byType[result.fileType]++;
            } else {
                stats.failed++;
            }
        });

        return stats;
    }
}

module.exports = ExtractorDatos; 