# -*- coding: utf-8 -*-
"""
文档路由模块
"""

from flask import Response, jsonify, request

from services.markdown_document_service import get_markdown_document_service


def register_document_routes(app, services: dict):
    """注册文档相关路由"""
    logger = services["logger"]

    @app.route("/api/documents/search")
    def search_documents():
        query = request.args.get("q", "").strip()
        limit = int(request.args.get("limit", 10))
        try:
            doc_service = get_markdown_document_service()
            results = doc_service.search(query, limit)
            return jsonify({
                "success": True,
                "results": results,
                "total": len(results),
            })
        except Exception as exc:
            logger.error(f"搜索文档失败: {exc}")
            return jsonify({"success": False, "message": "搜索失败"}), 500

    @app.route("/api/documents/<doc_id>")
    def get_document(doc_id):
        try:
            doc_service = get_markdown_document_service()
            doc = doc_service.get_document(doc_id)
            if doc:
                return jsonify({"success": True, "document": doc.to_dict()})
            return jsonify({"success": False, "message": "文档不存在"}), 404
        except Exception as exc:
            logger.error(f"获取文档失败: {exc}")
            return jsonify({"success": False, "message": "获取文档失败"}), 500

    @app.route("/api/documents/<doc_id>/render")
    def render_document(doc_id):
        try:
            doc_service = get_markdown_document_service()
            html_content = doc_service.render_document(doc_id)
            if html_content:
                return Response(
                    html_content,
                    mimetype="text/html",
                    content_type="text/html; charset=utf-8",
                )
            return jsonify({"success": False, "message": "文档不存在"}), 404
        except Exception as exc:
            logger.error(f"渲染文档失败: {exc}")
            return jsonify({"success": False, "message": "渲染失败"}), 500

    @app.route("/api/documents/<doc_id>/markdown")
    def get_markdown_content(doc_id):
        try:
            doc_service = get_markdown_document_service()
            markdown_content = doc_service.get_markdown_content(doc_id)
            if markdown_content:
                return markdown_content, 200, {"Content-Type": "text/markdown; charset=utf-8"}
            return jsonify({"success": False, "message": "文档不存在"}), 404
        except Exception as exc:
            logger.error(f"获取Markdown内容失败: {exc}")
            return jsonify({"success": False, "message": "获取内容失败"}), 500

    @app.route("/api/documents/categories")
    def get_document_categories():
        try:
            doc_service = get_markdown_document_service()
            categories = doc_service.get_categories()
            return jsonify({"success": True, "categories": categories})
        except Exception as exc:
            logger.error(f"获取文档分类失败: {exc}")
            return jsonify({"success": False, "message": "获取分类失败"}), 500

    @app.route("/api/documents/components")
    def get_document_components():
        try:
            doc_service = get_markdown_document_service()
            components = doc_service.get_components()
            return jsonify({"success": True, "components": components})
        except Exception as exc:
            logger.error(f"获取文档组件失败: {exc}")
            return jsonify({"success": False, "message": "获取组件失败"}), 500
