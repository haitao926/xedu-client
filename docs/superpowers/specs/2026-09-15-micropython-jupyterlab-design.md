# XEdu Client MicroPython JupyterLab 设计

## 目标

让学生从 XEdu Client 的课程实验进入一个明确的 ESP32 MicroPython 开发模式，在已经嵌入的 JupyterLab 中编辑代码，并完成连接、运行、停止、重启和查看串口输出的实验闭环。

XEdu Client 不复制 Thonny 的通用 IDE，也不把 MicroPython 伪装成普通 Jupyter 内核。JupyterLab 负责代码编辑与工作区呈现，XEdu 的 JupyterLab 插件负责教学入口，本地设备服务负责 USB 串口与 MicroPython 设备控制。

## 用户流程

```text
课程资源 → ESP32 MicroPython 实验 → 开始实验
  → JupyterLab 打开实验文件
  → 打开 ESP32 实验面板
  → 刷新并选择串口
  → 连接开发板
  → 运行当前文件
  → 查看串口输出 / REPL
  → 停止或重启
```

实验面板必须使用学生能理解的语言：`连接开发板`、`运行到 ESP32`、`停止运行`、`重启设备`，不暴露 `mpremote` 命令、内部 API 或项目路径细节。

## 架构

### JupyterLab 前端插件

插件以 JupyterLab 4 prebuilt extension 形式安装到当前 Python 环境，并在 JupyterLab 右侧提供 ESP32 实验面板。插件负责：

- 注册命令和侧边栏入口；
- 读取当前活动文件；
- 展示实验说明和设备状态；
- 调用同源 Jupyter Server 的 MicroPython API；
- 轮询串口输出并将输出呈现给学生。

插件只在 JupyterLab 中运行，不在 XEdu 主页面额外创建第二个编辑器。

### Jupyter Server 设备接口

Jupyter Server 扩展提供同源 `/xedu-micropython/*` 路由，避免插件跨域访问 Electron 后端和暴露进程 capability。接口负责转发到 XEdu 的设备服务会话。

第一版接口：

- `GET /xedu-micropython/ports`
- `POST /xedu-micropython/connect`
- `POST /xedu-micropython/disconnect`
- `POST /xedu-micropython/run`
- `POST /xedu-micropython/input`
- `POST /xedu-micropython/interrupt`
- `POST /xedu-micropython/reset`
- `GET /xedu-micropython/output?after=<cursor>`

接口只允许本地 Jupyter 进程使用，并复用当前 Jupyter 工作目录作为实验文件边界。

### 设备会话

设备会话是独立于 Jupyter kernel 的状态对象：

- 设备端口；
- 连接状态；
- 接收输出缓冲区和递增 cursor；
- 当前运行文件；
- 串口读线程；
- 关闭和清理事件。

串口采用 `pyserial`，默认波特率为 `115200`。文件运行通过受控的 MicroPython 执行协议完成，不能拼接未经校验的 shell 命令。第一版假设 ESP32 已经刷入 MicroPython 固件；固件刷写作为后续独立能力，不阻塞基本编程闭环。

## 实验上下文

MicroPython 实验使用现有课程文件夹，入口文件默认为实验目录下的 `main.py`，也允许课程元数据指定入口文件。插件初版从当前 Jupyter 工作目录和当前打开文件推断上下文；没有实验上下文时显示“请从课程实验进入”，不允许误操作任意目录。

## 错误处理

- 没有串口：显示“未发现 ESP32，请检查 USB 数据线和驱动”。
- 端口被占用：显示“串口正在被其他程序使用，请关闭串口监视器后重试”。
- 设备未运行 MicroPython：显示“设备没有返回 MicroPython REPL，请先准备固件”。
- 运行超时：保留已有输出，提供停止和重启操作。
- Jupyter 重启或页面关闭：设备会话释放串口资源。
- 多次连接：先关闭旧会话，再创建新会话，避免串口锁死。

## 第一版范围

包含：

- ESP32 USB 串口发现；
- JupyterLab 内实验面板；
- 连接和断开；
- 当前 `.py` 文件运行；
- REPL 输入；
- 实时输出轮询；
- `Ctrl+C` 中断；
- 软重启；
- 测试、打包和版本升级到 `2.1.0`。

暂不包含：

- 固件刷写向导；
- WebREPL 和 BLE；
- ESP8266、RP2040 等其他板卡；
- 设备文件浏览器和包管理器；
- MicroPython Jupyter kernel；
- 独立编辑器或 Thonny 启动器。

## 验收标准

1. 从一个课程实验进入 JupyterLab 后，可以打开 ESP32 面板。
2. 插入 ESP32 后可以看到串口并连接。
3. 运行 `main.py` 可以在面板中看到设备输出。
4. 长时间运行的程序可以通过“停止运行”中断。
5. “重启设备”后可以重新连接并运行。
6. 没有设备、端口占用和错误固件时，学生看到的是可理解的中文提示。
7. 普通 Python/Jupyter 实验的启动、编辑和运行不受影响。
