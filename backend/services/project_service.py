import os
import json
import shutil
from datetime import datetime
from pathlib import Path
from utils.logger import get_logger

logger = get_logger(__name__)

class ProjectService:
    def __init__(self, templates_dir: str = None):
        if templates_dir is None:
            # Default to data/templates relative to the project root
            base_dir = Path(__file__).parent.parent.parent
            self.templates_dir = base_dir / "data" / "templates"
        else:
            self.templates_dir = Path(templates_dir)
            
        self._ensure_templates_dir()

    def _ensure_templates_dir(self):
        """确保模板目录存在，并创建默认模板"""
        if not self.templates_dir.exists():
            self.templates_dir.mkdir(parents=True, exist_ok=True)
            self._create_default_templates()

    def _create_default_templates(self):
        """创建基础内置模板"""
        # 1. 空白项目模板
        blank_dir = self.templates_dir / "blank"
        blank_dir.mkdir(exist_ok=True)
        (blank_dir / "notebooks").mkdir(exist_ok=True)
        (blank_dir / "datasets").mkdir(exist_ok=True)
        with open(blank_dir / "README.md", "w", encoding="utf-8") as f:
            f.write("# 空白项目\n\n这是一个基础的 XEdu 项目。可以在这里编写代码、放置数据集。")
        with open(blank_dir / "template.json", "w", encoding="utf-8") as f:
            json.dump({
                "id": "blank",
                "name": "空白项目",
                "description": "包含标准目录结构的空白项目 (notebooks/, datasets/)",
                "icon": "icon-folder.svg"
            }, f, ensure_ascii=False, indent=2)

        # 2. MMEdu 图像分类模板
        mmedu_dir = self.templates_dir / "mmedu_classification"
        mmedu_dir.mkdir(exist_ok=True)
        (mmedu_dir / "notebooks").mkdir(exist_ok=True)
        (mmedu_dir / "datasets" / "cats_dogs").mkdir(parents=True, exist_ok=True)
        with open(mmedu_dir / "README.md", "w", encoding="utf-8") as f:
            f.write("# MMEdu 图像分类\n\n基于 MMEdu 的基础图像分类示例课程。")
        with open(mmedu_dir / "notebooks" / "01_image_classification.ipynb", "w", encoding="utf-8") as f:
            # 一个极简的 notebook 骨架
            f.write('{"cells":[{"cell_type":"markdown","metadata":{},"source":["# MMEdu 图像分类体验"]},{"cell_type":"code","execution_count":null,"metadata":{},"outputs":[],"source":["from MMEdu import MMClassification as cls\\n","model = cls(backbone=\'LeNet\')\\n","print(\'MMEdu 引入成功！\')"]}],"metadata":{"kernelspec":{"display_name":"Python 3","language":"python","name":"python3"}},"nbformat":4,"nbformat_minor":2}')
        with open(mmedu_dir / "template.json", "w", encoding="utf-8") as f:
            json.dump({
                "id": "mmedu_classification",
                "name": "MMEdu 图像分类",
                "description": "内置基础的图像分类网络和数据集占位，适合快速开展计算机视觉教学。",
                "icon": "experiment-cover-16x9.svg"
            }, f, ensure_ascii=False, indent=2)

    def get_templates(self):
        """获取所有可用的模板列表"""
        templates = []
        if self.templates_dir.exists():
            for t_dir in self.templates_dir.iterdir():
                if t_dir.is_dir():
                    meta_path = t_dir / "template.json"
                    if meta_path.exists():
                        try:
                            with open(meta_path, "r", encoding="utf-8") as f:
                                meta = json.load(f)
                                templates.append(meta)
                        except Exception as e:
                            logger.error(f"读取模板元数据失败 {meta_path}: {e}")
        return templates

    def get_default_project_path(self) -> str:
        """获取默认的项目保存路径"""
        # 默认保存到用户的文档目录下的 XEdu_Projects
        default_path = Path.home() / "Documents" / "XEdu_Projects"
        return str(default_path)

    def create_project(self, name: str, path: str, template_id: str, description: str = "") -> dict:
        """根据模板创建新项目"""
        try:
            target_dir = Path(path) / name
            
            # 1. 检查目录是否已存在
            if target_dir.exists():
                return {"success": False, "message": f"目录已存在: {target_dir}"}
                
            # 2. 查找并拷贝模板
            template_source = self.templates_dir / template_id
            if template_id == "blank" or not template_source.exists():
                 # 容错：如果找不到对应模板，回退到空白模板
                 template_source = self.templates_dir / "blank"
                 
            shutil.copytree(template_source, target_dir)
            
            # 删除从模板复制过来的 template.json
            copied_template_meta = target_dir / "template.json"
            if copied_template_meta.exists():
                copied_template_meta.unlink()

            # 3. 创建项目的元数据文件 .xedu_project.json
            project_meta = {
                "name": name,
                "description": description,
                "created_at": datetime.utcnow().isoformat() + "Z",
                "template_id": template_id,
                "entry_point": "README.md"
            }
            
            # 尝试寻找 notebook 作为入口
            notebooks_dir = target_dir / "notebooks"
            if notebooks_dir.exists():
                notebooks = list(notebooks_dir.glob("*.ipynb"))
                if notebooks:
                    project_meta["entry_point"] = f"notebooks/{notebooks[0].name}"

            with open(target_dir / ".xedu_project.json", "w", encoding="utf-8") as f:
                json.dump(project_meta, f, ensure_ascii=False, indent=2)

            return {
                "success": True, 
                "message": "项目创建成功", 
                "project_path": str(target_dir),
                "entry_point": project_meta["entry_point"]
            }
            
        except Exception as e:
            logger.error(f"创建项目失败: {e}")
            return {"success": False, "message": f"创建项目失败: {str(e)}"}
