"""
A2 EVENTOS - CLIENTE POSTGRESQL EDGE
Conexão direta com o mesmo banco do sistema de credenciamento
"""

import os
import json
import numpy as np
from typing import Optional, List, Dict
import psycopg2
from psycopg2 import pool
from loguru import logger


class PostgresEdgeClient:
    """Cliente PostgreSQL para o módulo de câmeras (mesmo banco do sistema A2)"""
    
    def __init__(self, host=None, port=None, user=None, password=None, database=None):
        self.host = host or os.getenv('PG_EDGE_HOST', 'postgres_edge')
        self.port = port or int(os.getenv('PG_EDGE_PORT', '5432'))
        self.user = user or os.getenv('PG_EDGE_USER', 'a2_edge_user')
        self.password = password or os.getenv('PG_EDGE_PASSWORD', 'a2_edge_password')
        self.database = database or os.getenv('PG_EDGE_DB', 'a2_edge_db')
        
        self.pool = None
        self._connect()
        
        logger.info(f"🔗 PostgresEdgeClient inicializado: {self.host}:{self.port}/{self.database}")
    
    def _connect(self):
        """Cria pool de conexões"""
        try:
            self.pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=10,
                host=self.host,
                port=self.port,
                user=self.user,
                password=self.password,
                database=self.database
            )
            logger.info(f"✅ PostgreSQL Edge conectado!")
        except Exception as e:
            logger.error(f"❌ Erro ao conectar no PostgreSQL Edge: {e}")
            raise
    
    def search_similar_face(self, embedding: List[float], threshold: float = 0.55) -> Optional[Dict]:
        """Busca face mais similar usando pgvector (<=> cosine distance)"""
        conn = None
        try:
            conn = self.pool.getconn()
            cursor = conn.cursor()
            
            # Converter embedding para string pgvector
            embedding_str = f'[{",".join(str(x) for x in embedding)}]'
            
            # Query usando operador <=> do pgvector
            cursor.execute("""
                SELECT id, nome_completo, cpf, status_acesso, 1 - (face_encoding <=> %s) as confidence
                FROM pessoas
                WHERE face_encoding IS NOT NULL
                  AND status_acesso = 'ativo'
                ORDER BY face_encoding <=> %s ASC
                LIMIT 1
            """, (embedding_str, embedding_str))
            
            result = cursor.fetchone()
            
            if result:
                conf = float(result[4])
                if conf >= threshold:
                    return {
                        'id': str(result[0]),
                        'nome': result[1],
                        'cpf': result[2],
                        'status_acesso': result[3],
                        'confidence': conf
                    }
            
            return None
            
        except Exception as e:
            logger.error(f"❌ Erro na busca por face: {e}")
            return None
        finally:
            if conn:
                self.pool.putconn(conn)
    
    def get_all_faces(self) -> List[Dict]:
        """Retorna todas as pessoas com face_embedding"""
        conn = None
        try:
            conn = self.pool.getconn()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT id, nome_completo, cpf, face_encoding
                FROM pessoas
                WHERE face_encoding IS NOT NULL
                  AND status_acesso = 'ativo'
            """)
            
            results = []
            for row in cursor.fetchall():
                results.append({
                    'id': str(row[0]),
                    'nome': row[1],
                    'cpf': row[2],
                    'embedding': row[3]
                })
            
            return results
            
        except Exception as e:
            logger.error(f"❌ Erro ao buscar faces: {e}")
            return []
        finally:
            if conn:
                self.pool.putconn(conn)
    
    def close(self):
        """Fecha pool de conexões"""
        if self.pool:
            self.pool.closeall()
            logger.info("🔒 PostgreSQL Edge desconectado")


def get_postgres_client() -> PostgresEdgeClient:
    """Factory para obter cliente PostgreSQL"""
    return PostgresEdgeClient()