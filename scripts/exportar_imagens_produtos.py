import argparse
import os
from io import BytesIO

from firebird.driver import connect
from PIL import Image


def blob_to_bytes(b):
    if b is None:
        return None
    # firebird-driver pode retornar um "BlobReader" ou bytes
    if hasattr(b, "read"):
        return b.read()
    if isinstance(b, (bytes, bytearray, memoryview)):
        return bytes(b)
    return bytes(b)


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--main-db", required=True)
    ap.add_argument("--aux-db", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--user", default="SYSDBA")
    ap.add_argument("--password", default="masterkey")
    ap.add_argument("--overwrite", action="store_true")
    ap.add_argument("--codes", default="")
    args = ap.parse_args()

    codes = set()
    if args.codes:
        for raw in args.codes.split(","):
            raw = raw.strip()
            if not raw:
                continue
            try:
                codes.add(int(raw))
            except ValueError:
                pass

    ensure_dir(args.out_dir)

    # 1) Lê mapa PRO_CODIGO -> ID_IMAGEM no MAIN (preferindo EMPRESA 1)
    main_con = connect(
        database=args.main_db,
        user=args.user,
        password=args.password,
        charset="WIN1252",
    )

    cur = main_con.cursor()
    cur.execute("""
        SELECT EMPRESA, PRO_CODIGO, ID_IMAGEM
        FROM PRODUTOS_IMAGEM
        WHERE EMPRESA IN (1, 2)
          AND ORDEM_IMAGEM = 1
        ORDER BY PRO_CODIGO, EMPRESA
    """)

    chosen = {}  # pro_codigo -> (empresa, id_imagem)
    for empresa, pro_codigo, id_imagem in cur.fetchall():
        if pro_codigo not in chosen:
            chosen[pro_codigo] = (empresa, id_imagem)
        else:
            # preferir empresa 1
            emp_old, _ = chosen[pro_codigo]
            if emp_old != 1 and empresa == 1:
                chosen[pro_codigo] = (empresa, id_imagem)

    if codes:
        chosen = {k: v for k, v in chosen.items() if k in codes}

    cur.close()
    main_con.close()

    # 2) Busca blobs no AUX e salva JPG
    aux_con = connect(
        database=args.aux_db,
        user=args.user,
        password=args.password,
        charset="WIN1252",
    )
    aux_cur = aux_con.cursor()

    ok = 0
    skipped = 0
    fail = 0

    for pro_codigo, (empresa, id_imagem) in chosen.items():
        out_path = os.path.join(args.out_dir, f"{pro_codigo}.jpg")

        if os.path.exists(out_path) and not args.overwrite:
            skipped += 1
            continue

        try:
            aux_cur.execute("SELECT IMAGEM FROM IMAGENS WHERE ID_IMAGEM = ?", (id_imagem,))
            row = aux_cur.fetchone()
            if not row:
                fail += 1
                continue

            data = blob_to_bytes(row[0])
            if not data:
                fail += 1
                continue

            # tenta abrir como imagem (jpeg/png/etc)
            img = Image.open(BytesIO(data))

            # padroniza para JPG
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            elif img.mode == "L":
                img = img.convert("RGB")

            img.save(out_path, format="JPEG", quality=90, optimize=True)
            ok += 1

        except Exception as e:
            fail += 1
            # cria um dump pra debug quando der ruim
            try:
                dump_path = os.path.join(args.out_dir, f"{pro_codigo}.bin")
                with open(dump_path, "wb") as f:
                    f.write(data if data else b"")
            except Exception:
                pass

            print(f"[ERRO] pro_codigo={pro_codigo} id_imagem={id_imagem} empresa={empresa} -> {e}")

    aux_cur.close()
    aux_con.close()

    print("====================================")
    print("Exportação concluída")
    print(f"Salvas:    {ok}")
    print(f"Puladas:   {skipped} (já existiam e sem --overwrite)")
    print(f"Falhas:    {fail}")
    print("Saída: ", args.out_dir)
    print("====================================")


if __name__ == "__main__":
    main()
