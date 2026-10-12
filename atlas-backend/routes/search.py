from flask import request, jsonify, session
import requests
from db_handler.library import batch_check_titles_in_library
import nltk
from rank_bm25 import BM25Okapi
from datetime import datetime

try:
    from sentence_transformers import SentenceTransformer, util
    model = SentenceTransformer("allenai-specter2")
except Exception:
    model = None


def tokenize(text):
    try:
        return nltk.word_tokenize(text.lower())
    except LookupError:
        nltk.download('punkt', quiet=True)
        return nltk.word_tokenize(text.lower())


def compute_bm25_ranking(articles, query):
    docs = [a.get("title", "") + " " + a.get("abstract", "") for a in articles if isinstance(a, dict)]
    tokenized_corpus = [tokenize(doc) for doc in docs]
    bm25 = BM25Okapi(tokenized_corpus)
    tokenized_query = tokenize(query)
    scores = bm25.get_scores(tokenized_query)
    for i, a in enumerate(articles):
        a["bm25_score"] = float(scores[i]) if i < len(scores) else 0.0
    return articles


def compute_semantic_ranking(articles, query):
    if not model:
        return articles
    texts = [
        (a.get("title", "") + " " + a.get("abstract", ""))
        for a in articles
        if isinstance(a, dict)
    ]
    q_emb = model.encode(query, convert_to_tensor=True)
    d_emb = model.encode(texts, convert_to_tensor=True)
    scores = util.cos_sim(q_emb, d_emb)[0].cpu().tolist()
    for i, a in enumerate(articles):
        a["semantic_score"] = float(scores[i]) if i < len(scores) else 0.0
    return articles


def rank_articles(articles, query, mode="basic"):
    """ mode = basic | bm25 | semantic | hybrid """
    if mode == "bm25":
        articles = compute_bm25_ranking(articles, query)
        ranked = sorted(articles, key=lambda a: a.get("bm25_score", 0), reverse=True)
    elif mode == "semantic":
        articles = compute_semantic_ranking(articles, query)
        ranked = sorted(articles, key=lambda a: a.get("semantic_score", 0), reverse=True)
    elif mode == "hybrid":
        articles = compute_bm25_ranking(articles, query)
        articles = compute_semantic_ranking(articles, query)
        for a in articles:
            a["hybrid_score"] = 0.5 * a.get("bm25_score", 0) + 0.5 * a.get("semantic_score", 0)
        ranked = sorted(articles, key=lambda a: a.get("hybrid_score", 0), reverse=True)
    else:
        ranked = articles
    return ranked


def register_search_routes(app):
    @app.route("/search", methods=["GET"])
    @app.route("/flask-api/search", methods=["GET"])
    def search():
        query = request.args.get("query")
        database = request.args.get("db", "pubmed")
        mode = request.args.get("mode", "basic").lower()
        page = int(request.args.get("page", 1))
        retmax, retstart = 50, (page - 1) * 50
        mindate, maxdate = request.args.get("start_date"), request.args.get("end_date")

        if not query:
            return jsonify({"error": "No query provided"}), 400

        # --- PubMed E-Utilities (Automatic Term Mapping) ---
        base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
        params = {
            "db": database,
            "term": query,  # let PubMed handle MeSH expansion & synonym mapping
            "retmode": "json",
            "retmax": retmax,
            "retstart": retstart,
            "usehistory": "y",  # stable pagination & relevance
            "sort": "relevance"
        }

        if mindate and maxdate:
            params.update({
                "mindate": mindate,
                "maxdate": maxdate,
                "datetype": "pdat"
            })

        response = requests.get(base_url, params=params)
        esearch_data = response.json().get("esearchresult", {})
        id_list = esearch_data.get("idlist", [])
        total_results = int(esearch_data.get("count", 0))

        if not id_list:
            return jsonify({"message": "No articles found"}), 404

        # --- Fetch summaries ---
        details_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
        details_params = {"db": database, "id": ",".join(id_list), "retmode": "json"}
        details_response = requests.get(details_url, params=details_params)
        articles_json = details_response.json()
        articles = [v for k, v in articles_json["result"].items() if k != "uids" and isinstance(v, dict)]

        # --- Fetch abstracts (optional for ranking) ---
        fetch_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
        fetch_params = {
            "db": database,
            "id": ",".join(id_list),
            "retmode": "xml",
        }
        fetch_response = requests.get(fetch_url, params=fetch_params)
        if fetch_response.ok:
            from xml.etree import ElementTree as ET
            tree = ET.fromstring(fetch_response.text)
            abstract_texts = tree.findall(".//AbstractText")
            for art, abstract_xml in zip(articles, abstract_texts):
                if abstract_xml is not None and abstract_xml.text:
                    art["abstract"] = abstract_xml.text

        # --- Ranking ---
        print("🔎 Ranking mode:", mode)
        ranked_articles = rank_articles(articles, query, mode)
        print(f"✅ Ranked {len(ranked_articles)} articles using mode: {mode}")

        # --- Mark user library items ---
        user_id = session.get("userId")
        if user_id:
            titles_to_check = [a.get("title", "") for a in ranked_articles if "title" in a]
            already_added = batch_check_titles_in_library(user_id, titles_to_check)
            for a in ranked_articles:
                if "title" in a:
                    a["alreadyAdded"] = a["title"] in already_added

        return jsonify({
            "results": ranked_articles,
            "pagination": {
                "current_page": page,
                "per_page": retmax,
                "total_results": total_results,
                "total_pages": (total_results + retmax - 1) // retmax,
            },
            "ranking_mode": mode,
        })
