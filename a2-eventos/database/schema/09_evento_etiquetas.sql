-- database/schema/09_evento_etiquetas.sql

CREATE TABLE IF NOT EXISTS evento_etiqueta_layouts (
    id SERIAL PRIMARY KEY,
    evento_id UUID REFERENCES eventos(id) ON DELETE CASCADE,
    papel_config JSONB NOT NULL DEFAULT '{"layout": "zebra_tlp2844", "width": 100, "height": 150}',
    elementos JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(evento_id)
);
