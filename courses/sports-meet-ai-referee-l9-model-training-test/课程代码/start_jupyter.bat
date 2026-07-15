@echo off
chcp 65001 >nul

call C:\aisoft\XEdu\env\Scripts\activate.bat

call C:\aisoft\XEdu\env\python.exe -m ipykernel install --user

call jupyter notebook

pause