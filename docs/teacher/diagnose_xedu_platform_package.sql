SET NOCOUNT ON;

DECLARE @PlatformOrigin nvarchar(512) = N'http://10.74.136.127';
SET @PlatformOrigin = RTRIM(@PlatformOrigin);
IF RIGHT(@PlatformOrigin, 1) = N'/'
    SET @PlatformOrigin = LEFT(@PlatformOrigin, LEN(@PlatformOrigin) - 1);

IF OBJECT_ID(N'dbo.XEduCoursePackage', N'U') IS NULL
BEGIN
    SELECT N'未找到 dbo.XEduCoursePackage，请先选择学习平台使用的数据库。' AS Diagnostic;
    RETURN;
END;

SELECT TOP (30)
    Id AS PackageId,
    CourseId AS PlatformCourseId,
    XEduCourseId,
    CourseVersion,
    PackageUrl,
    PackageSize,
    PackageSha256,
    CASE WHEN NULLIF(LTRIM(RTRIM(CourseVersion)), N'') IS NULL
        THEN N'缺少课程版本' ELSE N'有课程版本' END AS VersionCheck,
    CASE WHEN NULLIF(LTRIM(RTRIM(PackageUrl)), N'') IS NULL THEN N'缺少下载地址'
        WHEN LEFT(PackageUrl, LEN(@PlatformOrigin) + 1) = @PlatformOrigin + N'/'
            THEN N'与当前平台地址一致'
        WHEN PackageUrl LIKE N'http://localhost/%' OR PackageUrl LIKE N'http://localhost:%'
            OR PackageUrl LIKE N'https://localhost/%' OR PackageUrl LIKE N'https://localhost:%'
            OR PackageUrl LIKE N'http://127.0.0.1/%' OR PackageUrl LIKE N'http://127.0.0.1:%'
            OR PackageUrl LIKE N'https://127.0.0.1/%' OR PackageUrl LIKE N'https://127.0.0.1:%'
            THEN N'保存的是本机地址，需核对服务器运行版本是否正确改写'
        ELSE N'保存地址与当前平台不同，需检查 IP、协议和端口' END AS UrlCheck,
    CASE WHEN DATALENGTH(PackageSha256) = 64
            AND PackageSha256 COLLATE Latin1_General_BIN2 NOT LIKE '%[^0-9a-f]%'
        THEN N'SHA-256 格式有效，尚未核对 ZIP 字节'
        ELSE N'SHA-256 缺失或格式无效' END AS HashCheck,
    CASE WHEN PackageSize > 0 THEN N'大小字段有效，尚未核对 ZIP 字节'
        ELSE N'大小字段缺失或无效' END AS SizeCheck
FROM dbo.XEduCoursePackage
ORDER BY Id DESC;

IF OBJECT_ID(N'dbo.XEduActivity', N'U') IS NOT NULL
BEGIN
    SELECT TOP (30)
        Id AS ActivityBindingId, Lid, PackageId, CourseId, CourseVersion,
        PackageUrl, PackageSize, PackageSha256
    FROM dbo.XEduActivity
    ORDER BY Id DESC;
END;

IF OBJECT_ID(N'dbo.XEduLaunchGrant', N'U') IS NOT NULL
BEGIN
    SELECT TOP (20)
        Id AS LaunchId, PackageId, CourseId, CourseVersion,
        PackageUrl, PackageSize, PackageSha256, CreatedAt
    FROM dbo.XEduLaunchGrant
    ORDER BY Id DESC;
END;
