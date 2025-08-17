# DataFinder

Una aplicación web para extraer datos de documentos PDF, Excel y Word de manera eficiente y profesional.

## Características

- **Extracción Inteligente**: Detecta automáticamente el tipo de documento y extrae datos relevantes
- **Extracción con IA**: Usa OpenAI para extracción precisa y flexible de cualquier campo
- **Múltiples Formatos**: Soporta PDF, Excel (.xlsx, .xls) y Word (.docx, .doc)
- **Extracción Específica**: Permite extraer campos específicos como números de orden, cantidades, nombres de clientes, etc.
- **Exportación Múltiple**: Exporta resultados a PDF, Word y Excel
- **Interfaz Profesional**: Diseño limpio y moderno sin elementos distractores
- **Visualización Clara**: Presenta los datos en formato de tabla para mejor legibilidad

## Instalación

1. Clona el repositorio:
```bash
git clone https://github.com/tu-usuario/dataFinder.git
cd dataFinder
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura OpenAI (opcional, para extracción con IA):
   - Crea un archivo `.env` en la raíz del proyecto
   - Agrega tu API key de OpenAI: `OPENAI_API_KEY=tu-api-key-aqui`
   - Obtén tu API key gratuita en: https://platform.openai.com/api-keys

4. Inicia el servidor:
```bash
npm start
```

5. Abre tu navegador en `http://localhost:3000`

## Uso

### Extracción de Todo el Contenido
1. Selecciona "Todo el contenido"
2. Sube tus archivos
3. Haz clic en "Extraer Datos"

### Extracción de Campos Específicos
1. Selecciona "Solo campos específicos"
2. Escribe los campos que quieres extraer (uno por línea)
3. Sube tus archivos
4. Haz clic en "Extraer Datos"

### Extracción con IA (Recomendado)
1. Selecciona "Extracción con IA"
2. Escribe los campos que quieres extraer (uno por línea)
3. Sube tus archivos
4. Haz clic en "Extraer Datos"
5. La IA extraerá los campos de manera inteligente y precisa

### Campos Específicos Disponibles
- `número de orden` - Extrae números de orden de manifiestos
- `cantidad de cajas` - Extrae cantidades de cajas
- `nombre del cliente` - Extrae nombres de clientes
- `número de teléfono` - Extrae números de teléfono
- `dirección` - Extrae direcciones
- `id de carga` - Extrae IDs de carga
- `id del envío` - Extrae IDs de envío

**Con IA**: Puedes usar cualquier descripción de campo, por ejemplo:
- "Número de orden"
- "ID de la carga"
- "ID del envío"
- "Cliente"
- "Teléfono"
- "Dirección"
- Cualquier campo personalizado que necesites

### Exportación
- **PDF**: Lista numerada de resultados
- **Word**: Tabla estructurada con datos
- **Excel**: Hojas separadas por categoría

## Tecnologías Utilizadas

- **Backend**: Node.js, Express.js
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Procesamiento**: pdfjs-dist, xlsx, mammoth
- **IA**: OpenAI API (GPT-3.5-turbo)
- **Exportación**: PDFKit, docx, xlsx

## Estructura del Proyecto

```
dataFinder/
├── public/
│   └── index.html          # Interfaz de usuario
├── server.js               # Servidor Express
├── index.js                # Lógica de extracción
├── package.json            # Dependencias
└── README.md              # Documentación
```

## API Endpoints

- `GET /` - Página principal
- `POST /api/extract` - Extraer datos de archivos (método tradicional)
- `POST /api/extract-ai` - Extraer datos con IA
- `POST /api/export` - Exportar resultados
- `GET /api/stats` - Estadísticas del servidor

## Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## Contacto

Tu Nombre - [@tu-twitter](https://twitter.com/tu-twitter) - email@example.com

Link del proyecto: [https://github.com/tu-usuario/dataFinder](https://github.com/tu-usuario/dataFinder) # Forzar redeploy
