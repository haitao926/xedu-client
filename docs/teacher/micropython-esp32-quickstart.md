# ESP32 MicroPython 实验快速开始

MicroPython 留在现有的 JupyterLab 实验页里。学生外壳（课程任务中心、全屏实验、AI 抽屉）不变。代码模式包含项目文件、`main.py` 编辑区、保存 / 运行 / 停止 / 上传、串口连接和底部输出。

## 课程里怎么标记

在实验上声明运行时，学生点进 Python 实验时会直接打开代码模式：

```json
{
  "title": "点亮 LED",
  "runtime": "micropython-esp32",
  "entry_file": "main.py",
  "path": "lesson1/blink",
  "files": [{ "name": "main.py", "path": "lesson1/blink/main.py" }]
}
```

`entry_file` 可以省略，默认打开 `main.py`。没有这个 `runtime` 的 Notebook / Python 实验仍按原来的 Jupyter 方式打开。

## 使用前

- 使用 USB 数据线连接 ESP32（课堂里常见的行空板 K10 也走这条 USB 串口）。
- 确认开发板已经刷入 MicroPython 固件。第一版 Client 不负责刷写固件。
- 关闭 Thonny、Arduino 串口监视器或其他占用串口的程序。
- USB 转串口芯片常见为 CH340、CP210x、FTDI 或 ESP32-S2/S3 原生 USB，波特率为 115200。

## 学生操作

1. 在课程任务中心打开带 `runtime: "micropython-esp32"` 的实验，进入 Python 实验。Client 会打开 JupyterLab，并自动进入 **MicroPython 代码模式**。
2. 如果实验没有声明 runtime，仍可在 JupyterLab 启动器的「XEdu 实验」里点击 **MicroPython 代码模式**，或用命令面板 / `Ctrl+Shift+E`（macOS 为 `Cmd+Shift+E`）打开。
3. 左侧「项目文件」列出当前实验目录里的 `.py`。点击文件即可编辑；「打开项目」回到 `main.py`。编辑器会标出关键字、字符串、注释和数字，保存、运行和上传仍使用这份代码。
4. 在工具栏选择串口，点击「连接设备」。
5. 「保存」写回实验目录。「运行」把当前文件送到开发板执行。「停止」中断程序。「上传」把当前 `.py` 写到开发板同名文件（例如 `main.py`）。「重启」软复位开发板。
6. 底部「输出」显示串口内容。需要直接输入命令时，用输出区下方的输入框。
7. 进入实验后，Client 左侧的「项目路径 / Jupyter 控制 / 运行日志」会自动收起，把宽度让给 JupyterLab 或代码模式。需要看日志或重启 Jupyter 时，点工具栏上的「控制」；再点「收起」即可隐藏。

## 开发与安装包

- 预构建插件位于 `backend/jupyterlab_micropython/labextension/`。打包后在 `Resources/backend/jupyterlab_micropython/labextension/`。
- JupyterLab 运行时是 `4.5.9`。插件 `package.json` 里的 `@jupyterlab/*` 依赖必须和这个版本重叠，否则 `jupyter labextension list` 会把它标成过期，启动器里就像没有插件。
- 每次启动 Jupyter，Client 会跳过空的 labextension 目录，并把这份已构建插件复制到用户数据目录的 `jupyter_data/labextensions/jupyterlab-micropython/`，放到 `JUPYTER_PATH` 前面。这样安装包里的文件存在时，代码模式可以稳定出现。
- 设备接口仍是 Jupyter 同源的 `/xedu-micropython/*`（含 `upload`）。不要再把学生指到单独的 Thonny。

## 常见问题

- **启动器里没有 MicroPython**：确认上面的 labextension 目录里有 `package.json` 和 `static/remoteEntry.*.js`，然后重新打开实验。空目录不会再挡住后面的正式插件。
- **没有串口**：检查 USB 是否支持数据传输，并确认系统已安装 CH340、CP210x 或板卡对应的串口驱动。
- **串口被占用**：关闭其他串口监视器、Arduino Serial Monitor 或 Thonny 后重试。
- **没有 MicroPython 提示**：开发板可能还没有刷入 MicroPython 固件。
- **连接后没有 `>>>`**：拔掉 USB 再插上，点击「刷新」后重新连接。
- **运行没有输出**：确认当前文件已保存，并在代码里使用 `print()`。
- **程序停不下来**：点击「停止」；仍无响应时点击「重启」，再重新运行。
