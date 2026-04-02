# -*- coding: utf-8 -*-
"""
文档路由模块
"""

from flask import jsonify, request


def register_document_routes(app, services: dict):
    """注册文档相关路由"""
    from services.document_service import get_document_service
    from services.markdown_document_service import get_markdown_document_service
    
    @app.route("/api/documents/search")
    def search_documents():
        query = request.args.get('q', '').strip()
        limit = int(request.args.get('limit', 10))
        
        doc_service = get_document_service()
        if doc_service:
            results = doc_service.search_documents(query, limit)
            return jsonify({
                "success": True,
                "results": results
            })
        return jsonify({"success": False, "message": "文档服务未初始化"}), 500

    @app.route("/api/documents/<doc_id>")
    def get_document(doc_id):
        doc_service = get_document_service()
        if doc_service:
            doc = doc_service.get_document(doc_id)
            if doc:
                return jsonify({
                    "success": True,
                    "document": doc
                })
            return jsonify({"success": False, "message": "文档不存在"}), 404
        return jsonify({"success": False, "message": "文档服务未初始化"}), 500

    @app.route("/api/documents/<doc_id>/render")
    def render_document(doc_id):
        doc_service = get_document_service()
        if doc_service:
            html = doc_service.render_document(doc_id)
            if html:
                return jsonify({
                    "success": True,
                    "html": html
                })
            return jsonify({"success": False, "message": "文档渲染失败"}), 500
        return jsonify({"success": False, "message": "文档服务未初始化"}), 500

    @app.route("/api/documents/<doc_id>/markdown")
    def get_document_markdown(doc_id):
        md_service = get_markdown_document_service()
        if md_service:
            content = md_service.get_document_content(doc_id)
            if content:
                return jsonify({
                    "success": True,
                    "content": content
                })
            return jsonify({"success": False, "message": "文档不存在"}), 404
        return jsonify({"success": False, "message": "文档服务未初始化"}), 500

    @app.route("/api/documents/categories")
    def get_categories():
        md_service = get_markdown_document_service()
        if md_service:
            categories = md_service.get_categories()
            return jsonify({
                "success": True,
                "categories": categories
            })
        return jsonify({"success": False, "message": "文档服务未初始化"}), 500

    @app.route("/api/documents/components")
    def get_components():
        md_service = get_markdown_document_service()
        if md_service:
            components = md_service.get_components()
            return jsonify({
                "success": True,
                "components": components
            })
        return jsonify({"success": False, "message": "文档服务未初始化"}), 500