export class ProjectWizard {
    constructor(apiService) {
        this.api = apiService;
        this.currentStep = 1;
        this.templates = [];
        this.selectedTemplateId = 'blank';
        this.defaultPath = '';
        this.createdProjectPath = null;
        
        this.modal = document.getElementById('projectWizardModal');
        this.init();
    }

    init() {
        // Expose to global app context
        window.app.projectWizard = this;
        
        // Load templates
        this.loadTemplates();
    }

    open() {
        this.currentStep = 1;
        this.selectedTemplateId = 'blank';
        this.createdProjectPath = null;
        this.updateUI();
        this.modal.style.display = 'flex';
        this.modal.classList.remove('hidden');
    }

    close() {
        this.modal.style.display = 'none';
        this.modal.classList.add('hidden');
    }

    async loadTemplates() {
        try {
            const baseUrl = window.app.config?.getApiBaseUrl() || 'http://127.0.0.1:8000';
            const res = await fetch(`${baseUrl}/api/projects/templates`);
            const data = await res.json();
            if (data.success) {
                this.templates = data.templates;
                this.defaultPath = data.default_path;
                if (!document.getElementById('wizard-project-path').value) {
                    document.getElementById('wizard-project-path').value = this.defaultPath;
                }
                this.renderTemplates();
            }
        } catch (e) {
            console.error("Failed to load templates", e);
            document.getElementById('wizard-template-list').innerHTML = '<div style="color:red; grid-column:1/-1;">无法加载模板，请确保后端服务正常运行。</div>';
        }
    }

    renderTemplates() {
        const list = document.getElementById('wizard-template-list');
        list.innerHTML = '';
        
        if (!this.templates || this.templates.length === 0) {
            list.innerHTML = '<div style="grid-column: 1/-1;">无可用模板，将默认创建空白项目。</div>';
            return;
        }

        this.templates.forEach(t => {
            const div = document.createElement('div');
            const isSelected = this.selectedTemplateId === t.id;
            div.className = `wizard-template-card ${isSelected ? 'selected' : ''}`;
            
            const iconPath = t.icon ? `assets/${t.icon}` : 'assets/icon-folder.svg';
            div.innerHTML = `
                <div class="wizard-template-icon">
                    <img src="${iconPath}" alt="${t.name}">
                </div>
                <div class="wizard-template-name">${t.name}</div>
                <div class="wizard-template-desc">${t.description}</div>
            `;
            
            div.onclick = () => {
                this.selectedTemplateId = t.id;
                this.renderTemplates(); // Re-render to update selected state
            };
            list.appendChild(div);
        });
    }

    nextStep() {
        if (this.currentStep === 1) {
            this.currentStep = 2;
            this.updateUI();
        } else if (this.currentStep === 2) {
            const name = document.getElementById('wizard-project-name').value.trim();
            const path = document.getElementById('wizard-project-path').value.trim();
            if (!name) {
                app.ui.showToast('请输入项目名称', 'error');
                return;
            }
            if (!path) {
                app.ui.showToast('请输入保存路径', 'error');
                return;
            }
            this.currentStep = 3;
            this.updateUI();
            this.createProject(name, path);
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateUI();
        }
    }

    async browsePath() {
        if (!window.electronAPI) {
            app.ui.showToast('仅在桌面应用内支持选择文件夹', 'warning');
            return;
        }
        try {
            const path = await window.electronAPI.invoke('select-folder');
            if (path) {
                document.getElementById('wizard-project-path').value = path;
            }
        } catch (e) {
            console.error('选择文件夹失败:', e);
        }
    }

    async createProject(name, path) {
        document.getElementById('wizard-progress-area').style.display = 'block';
        document.getElementById('wizard-success-area').style.display = 'none';
        document.getElementById('wizard-btn-finish').style.display = 'none';
        document.getElementById('wizard-btn-prev').style.display = 'none';
        document.getElementById('wizard-btn-next').style.display = 'none';

        try {
            const baseUrl = window.app.config?.getApiBaseUrl() || 'http://127.0.0.1:8000';
            const desc = document.getElementById('wizard-project-desc').value.trim();
            const res = await fetch(`${baseUrl}/api/projects/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name, path,
                    template_id: this.selectedTemplateId,
                    description: desc
                })
            });
            const data = await res.json();
            
            if (data.success) {
                this.createdProjectPath = data.project_path;
                document.getElementById('wizard-progress-area').style.display = 'none';
                document.getElementById('wizard-success-area').style.display = 'block';
                document.getElementById('wizard-success-path').innerText = `${data.project_path}`;
                document.getElementById('wizard-btn-finish').style.display = 'flex';
                // Mark step 3 as completed visually
                document.getElementById('wizard-step-3-indicator').classList.add('completed');
                document.getElementById('wizard-step-3-indicator').classList.remove('active');
            } else {
                app.ui.showToast(data.message || '创建失败', 'error');
                this.prevStep();
            }
        } catch (e) {
            console.error("Project creation error:", e);
            app.ui.showToast('请求后端失败', 'error');
            this.prevStep();
        }
    }

    async finish() {
        this.close();
        if (this.createdProjectPath) {
            document.getElementById('project-path').value = this.createdProjectPath;
            try {
                if (app.jupyter && typeof app.jupyter.confirmProjectPath === 'function') {
                     await app.jupyter.confirmProjectPath();
                }
                
                // Navigate to main tab automatically
                const navItem = document.querySelector('.nav-item[onclick*="main"]');
                if (navItem) {
                    app.ui.showTab('main', navItem);
                }

                // Automatically start Jupyter
                if (app.jupyter && typeof app.jupyter.startJupyter === 'function') {
                    app.jupyter.startJupyter();
                }
                app.ui.showToast('项目已成功加载并正在启动环境', 'success');
            } catch (e) {
                console.error("Failed to load new project:", e);
                app.ui.showToast('加载项目路径失败，请手动选择', 'error');
            }
        }
    }

    updateUI() {
        // Update Stepper Indicators
        for (let i = 1; i <= 3; i++) {
            const ind = document.getElementById(`wizard-step-${i}-indicator`);
            if (!ind) continue;
            
            // Reset classes
            ind.className = 'wizard-step';
            
            if (i < this.currentStep) {
                ind.classList.add('completed');
            } else if (i === this.currentStep) {
                ind.classList.add('active');
            }
        }

        // Update pages
        document.getElementById('wizard-step-1').style.display = this.currentStep === 1 ? 'block' : 'none';
        document.getElementById('wizard-step-2').style.display = this.currentStep === 2 ? 'block' : 'none';
        document.getElementById('wizard-step-3').style.display = this.currentStep === 3 ? 'block' : 'none';

        // Update buttons
        const btnPrev = document.getElementById('wizard-btn-prev');
        const btnNext = document.getElementById('wizard-btn-next');
        const btnFinish = document.getElementById('wizard-btn-finish');

        btnFinish.style.display = 'none';

        if (this.currentStep === 1) {
            btnPrev.style.display = 'none';
            btnNext.style.display = 'flex';
            btnNext.innerHTML = '下一步 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        } else if (this.currentStep === 2) {
            btnPrev.style.display = 'flex';
            btnNext.style.display = 'flex';
            btnNext.innerHTML = '开始创建 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
        }
    }
}