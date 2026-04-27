# A2 EVENTOS - SCRIPT DE TESTE DE WEBCAM
# Teste em tempo real com detecção facial
# Pressione 'q' para sair
# Pressione 's' para capturar snapshot manual
# Pressione 'd' para salvar frame com detecção

import os
import sys
import cv2
import numpy as np
from datetime import datetime
from pathlib import Path

# Adicionar src ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncio
from dotenv import load_dotenv
load_dotenv()

# Config
WEBCAM_INDEX = int(os.getenv("TEST_WEBCAM_INDEX", "0"))
WEBCAM_WIDTH = int(os.getenv("TEST_WEBCAM_WIDTH", "1920"))
WEBCAM_HEIGHT = int(os.getenv("TEST_WEBCAM_HEIGHT", "1080"))
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.65"))
MIN_FACE_SIZE = int(os.getenv("MIN_FACE_SIZE", "150"))

from utils.image_utils import validate_image_quality, save_snapshot

print("=" * 60)
print("A2 EVENTOS - TESTE DE WEBCAM COM DETECÇÃO FACIAL")
print("=" * 60)

# Carregar InsightFace
face_app = None
try:
    from insightface.app import FaceAnalysis
    print("⏳ Carregando modelo InsightFace Buffalo_L...")
    face_app = FaceAnalysis(name='buffalo_l')
    face_app.prepare(ctx_id=0, det_size=(640, 640))
    print("✅ InsightFace carregado!")
except ImportError:
    print("⚠️ InsightFace não instalado. Execute: pip install insightface")
    print("   Modo de demonstração ativado.")
except Exception as e:
    print(f"❌ Erro ao carregar InsightFace: {e}")
    print("   Modo de demonstração ativado.")

# Carregar Supabase para testar match
supabase = None
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    try:
        from services.supabase_client import SupabaseClient
        supabase = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        print("✅ Cliente Supabase inicializado")
    except Exception as e:
        print(f"⚠️ Erro ao conectar Supabase: {e}")

print()
print("CONTROLES:")
print("  [q] - Sair")
print("  [s] - Capturar snapshot manual")
print("  [d] - Salvar frame com detecção")
print("  [r] - Requisitar snapshots do servidor")
print("  [ESC] - Sair (alternativo)")
print()

# Pasta de snapshots
snapshot_dir = Path("logs/test_snapshots")
snapshot_dir.mkdir(parents=True, exist_ok=True)

def draw_fps(frame, fps):
    """Desenha FPS no frame"""
    cv2.putText(frame, f"FPS: {fps:.1f}", (10, 30),
               cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
    return frame

def draw_face_info(frame, faces):
    """Desenha informações das faces detectadas"""
    y_offset = 60
    
    for i, face in enumerate(faces):
        bbox = face['bbox']
        x1, y1, x2, y2 = [int(v) for v in bbox]
        
        # Cor baseada na confiança
        conf = face.get('confidence', 0)
        if conf > 0.9:
            color = (0, 255, 0)  # Verde
        elif conf > 0.7:
            color = (0, 255, 255)  # Amarelo
        else:
            color = (0, 0, 255)  # Vermelho
        
        # Desenhar retângulo
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        
        # Label
        label = f"Face {i+1}: {conf:.0%}"
        if face.get('nome'):
            label = f"{face['nome']} ({conf:.0%})"
            if face.get('is_watchlist'):
                label = f"⚠️ {label}"
        
        # Fundo do texto
        (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(frame, (x1, y1-h-10), (x1+w+10, y1), color, -1)
        cv2.putText(frame, label, (x1+5, y1-5),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
        
        y_offset += 30
    
    # Info geral
    info = f"Faces detectadas: {len(faces)}"
    cv2.putText(frame, info, (10, y_offset + 20),
               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    
    return frame

def process_frame(frame, face_app, supabase):
    """Processa um frame e retorna faces detectadas"""
    results = []
    
    if face_app is None:
        return results
    
    try:
        # Detectar faces
        faces = face_app.get(frame)
        
        for face in faces:
            bbox = face.bbox
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            
            # Verificar tamanho mínimo
            if width < MIN_FACE_SIZE or height < MIN_FACE_SIZE:
                continue
            
            face_data = {
                'bbox': bbox,
                'confidence': face.det_score,
                'embedding': face.normed_embedding.tolist() if hasattr(face, 'normed_embedding') else None,
                'nome': None,
                'is_watchlist': False
            }
            
            # Buscar match se tiver embedding
            if face_data['embedding'] and supabase:
                asyncio.run(process_match(face_data, supabase))
            
            results.append(face_data)
            
    except Exception as e:
        print(f"❌ Erro ao processar frame: {e}")
    
    return results

async def process_match(face_data, supabase):
    """Busca match no banco de dados"""
    try:
        match = await supabase.search_similar_faces(
            face_data['embedding'],
            threshold=0.4
        )
        
        if match:
            face_data['nome'] = match.get('nome', 'Desconhecido')
            
            # Verificar watchlist
            if match.get('cpf'):
                watchlist = await supabase.check_cpf_watchlist(match['cpf'])
                if watchlist:
                    face_data['is_watchlist'] = True
                    print(f"🚨 ATENÇÃO: {match['nome']} está na watchlist!")
        
    except Exception as e:
        pass

async def test_supabase_connection():
    """Testa conexão com Supabase"""
    if not supabase:
        return False
    
    try:
        result = await supabase.list_face_embeddings()
        print(f"✅ Conexão Supabase OK: {len(result)} embeddings cadastrados")
        return True
    except Exception as e:
        print(f"❌ Erro na conexão Supabase: {e}")
        return False

def main():
    """Loop principal"""
    global supabase
    
    # Testar conexão Supabase
    if supabase:
        asyncio.run(test_supabase_connection())
    
    # Abrir webcam
    print(f"📷 Abrindo webcam (índice {WEBCAM_INDEX})...")
    cap = cv2.VideoCapture(WEBCAM_INDEX)
    
    if not cap.isOpened():
        print("❌ Não foi possível abrir a webcam!")
        return
    
    # Configurar resolução
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, WEBCAM_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, WEBCAM_HEIGHT)
    
    actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"📐 Resolução: {actual_width}x{actual_height}")
    
    # FPS counter
    fps_counter = 0
    fps_time = datetime.now()
    current_fps = 0.0
    
    print("🎥 Iniciando captura...")
    print("=" * 60)
    
    while True:
        ret, frame = cap.read()
        
        if not ret:
            print("❌ Erro ao capturar frame")
            break
        
        # Calcular FPS
        fps_counter += 1
        elapsed = (datetime.now() - fps_time).total_seconds()
        
        if elapsed >= 1.0:
            current_fps = fps_counter / elapsed
            fps_counter = 0
            fps_time = datetime.now()
        
        # Processar frame
        faces = process_frame(frame, face_app, supabase)
        
        # Desenhar informações
        frame = draw_fps(frame, current_fps)
        frame = draw_face_info(frame, faces)
        
        # Mostrar frame
        cv2.imshow("A2 EVENTOS - TESTE WEBCAM", frame)
        
        # Teclas
        key = cv2.waitKey(1) & 0xFF
        
        if key == ord('q') or key == 27:  # q ou ESC
            print("\n👋 Saindo...")
            break
        
        elif key == ord('s'):  # Snapshot manual
            filename = f"manual_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
            path = snapshot_dir / filename
            save_snapshot(frame, str(path))
            print(f"📸 Snapshot salvo: {path}")
        
        elif key == ord('d') and faces:  # Salvar com detecção
            filename = f"detection_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
            path = snapshot_dir / filename
            save_snapshot(frame, str(path))
            print(f"🔍 Frame com detecção salvo: {path}")
        
        elif key == ord('r'):  # Request snapshots from server
            print("📡 Testando comunicação com servidor...")
    
    # Limpar
    cap.release()
    cv2.destroyAllWindows()
    
    print("✅ Encerrado com sucesso")

if __name__ == "__main__":
    main()