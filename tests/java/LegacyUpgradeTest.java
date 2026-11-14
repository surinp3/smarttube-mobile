package com.liskovsoft.smartyoutubetv2.tv.ui.playback;

import static org.junit.Assert.*;
import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import com.liskovsoft.appupdatechecker2.*;
import com.liskovsoft.appupdatechecker2.core.*;
import com.liskovsoft.appupdatechecker2.fixture.LegacyV11VersionChecker;
import com.liskovsoft.appupdatechecker2.other.SettingsManager;
import com.liskovsoft.appupdatechecker2.other.downloadmanager.DownloadManager;
import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.util.*;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowSystemClock;
import org.robolectric.util.ReflectionHelpers;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class LegacyUpgradeTest {
    private final Context context=RuntimeEnvironment.getApplication();
    private static Field field(Class<?> type,String name) throws Exception {
        Field f=type.getDeclaredField(name);f.setAccessible(true);return f;
    }
    private JSONObject manifest() throws Exception {
        try(InputStream in=getClass().getClassLoader().getResourceAsStream("tv-update-v16.json")) {
            assertNotNull(in); return new JSONObject(new String(in.readAllBytes(),StandardCharsets.UTF_8));
        }
    }
    private static final class VersionResult implements AppVersionCheckerListener {
        int code; boolean latest; Uri[] urls; List<String> changes;
        public void onChangelogReceived(boolean latest,String name,int code,List<String> changes,Uri[] urls) {
            this.latest=latest;this.code=code;this.urls=urls;this.changes=changes;
        }
        public void onCheckError(Exception error) { throw new AssertionError(error); }
        public void processDownloadUrls(Uri[] urls) {}
    }
    private VersionResult parseAsV11(JSONObject json,String abi) throws Exception {
        ReflectionHelpers.setStaticField(Build.class,"SUPPORTED_ABIS",new String[]{abi});
        VersionResult result=new VersionResult();
        LegacyV11VersionChecker checker=new LegacyV11VersionChecker(context,result);
        field(LegacyV11VersionChecker.class,"mCurrentAppVersion").setInt(checker,3011);
        Method method=LegacyV11VersionChecker.class.getDeclaredMethod("triggerFromJson",JSONObject.class);
        method.setAccessible(true);method.invoke(checker,json);return result;
    }
    @Test public void actualV16ResponseIsReadableByUnchangedV11ParserForEachArmAbi() throws Exception {
        for(String abi:new String[]{"armeabi-v7a","arm64-v8a"}) {
            VersionResult result=parseAsV11(manifest(),abi);
            assertFalse(result.latest);assertEquals(3016,result.code);
            assertTrue(result.changes.size()>5);
            assertEquals("jobhub.asia",result.urls[0].getHost());
            assertTrue(result.urls[0].getPath().endsWith(abi.equals("armeabi-v7a")?"ARMv7.apk":"ARM64.apk"));
        }
    }
    @Test public void legacyParserAcceptsCrossHostAndUniversalFallbackLists() throws Exception {
        JSONObject json=manifest();JSONObject pkg=json.getJSONObject("package");
        for(String abi:new String[]{"armeabi-v7a","arm64-v8a"}) {
            JSONArray urls=pkg.getJSONArray("downloadUrlList_"+abi);
            urls.put(urls.getString(0).replace("https://jobhub.asia/downloads/smarttube-tv/",
                    "https://github.com/surinp3/smarttube-mobile/releases/download/"));
        }
        String universal=pkg.getString("downloadUrl");
        pkg.put("downloadUrlList",new JSONArray().put(universal).put(universal.replace(
                "https://jobhub.asia/downloads/smarttube-tv/","https://github.com/surinp3/smarttube-mobile/releases/download/")));
        for(String abi:new String[]{"armeabi-v7a","arm64-v8a","unknown"}) {
            VersionResult result=parseAsV11(new JSONObject(json.toString()),abi);
            assertEquals(2,result.urls.length);assertEquals("github.com",result.urls[1].getHost());
        }
    }
    private void stream(DownloadManager manager,InputStream input,File output) throws Exception {
        Method method=DownloadManager.class.getDeclaredMethod("streamToFile",InputStream.class,Uri.class);
        method.setAccessible(true);
        try {method.invoke(manager,input,Uri.fromFile(output));}
        catch(InvocationTargetException failure){throw (Exception)failure.getCause();}
    }
    @Test public void transferLongerThanLegacyMinuteCompletesAndCountsBytes() throws Exception {
        DownloadManager manager=new DownloadManager(context);File output=new File(context.getCacheDir(),"slow.apk");
        byte[] data=new byte[2048];
        InputStream input=new ByteArrayInputStream(data){boolean advanced;
            @Override public synchronized int read(byte[] b,int off,int len){
                if(!advanced){ShadowSystemClock.advanceBy(Duration.ofSeconds(61));advanced=true;}
                return super.read(b,off,len);
            }};
        field(DownloadManager.class,"mExpectedLength").setLong(manager,data.length);
        stream(manager,input,output);
        assertEquals(data.length,output.length());assertEquals(data.length,manager.getSizeForDownloadedFile(0));
    }
    @Test public void incompleteTransferIsRejectedInsteadOfBecomingInstallPath() throws Exception {
        DownloadManager manager=new DownloadManager(context);
        field(DownloadManager.class,"mExpectedLength").setLong(manager,4096);
        try {stream(manager,new ByteArrayInputStream(new byte[2048]),new File(context.getCacheDir(),"partial.apk"));fail();}
        catch(IllegalStateException expected){assertTrue(expected.getMessage().contains("Incomplete"));}
    }
    @Test public void longTransferHasActionableTimeout() throws Exception {
        DownloadManager manager=new DownloadManager(context);
        InputStream input=new ByteArrayInputStream(new byte[1]){
            @Override public synchronized int read(byte[] b,int off,int len){ShadowSystemClock.advanceBy(Duration.ofMinutes(16));return super.read(b,off,len);}};
        try {stream(manager,input,new File(context.getCacheDir(),"timeout.apk"));fail();}
        catch(IllegalStateException expected){assertTrue(expected.getMessage().contains("15 minutes"));}
    }
    private static final class UpdateResult implements AppUpdateCheckerListener {
        Exception error; public void onUpdateFound(String version,List<String> changes,String path){}
        public void onUpdateError(Exception error){this.error=error;}
    }
    @Test public void missingOrInvalidApkReportsErrorAndNeverLaunchesInstaller() throws Exception {
        new SettingsManager(context).setApkPath(null);
        UpdateResult result=new UpdateResult();AppUpdateChecker checker=new AppUpdateChecker(context,result);
        checker.installUpdate();assertNotNull(result.error);assertTrue(result.error.getMessage().contains("missing"));
        File invalid=new File(context.getCacheDir(),"invalid.apk");Files.write(invalid.toPath(),new byte[2_000_000]);
        result.error=null;checker.onApkDownloaded(invalid.getAbsolutePath());assertNotNull(result.error);
        assertTrue(result.error.getMessage().contains("invalid"));
        assertNull(Shadows.shadowOf((Application)context).getNextStartedActivity());
    }
    @Test public void validCachedApkHandsContentUriAndReadPermissionToAndroidInstaller() throws Exception {
        File apk=new File(context.getCacheDir(),"signed-update.apk");Files.write(apk.toPath(),new byte[2_000_000]);
        PackageInfo info=new PackageInfo();info.packageName=context.getPackageName();info.versionCode=3017;
        Object shadow=Shadows.shadowOf(context.getPackageManager());
        Method setter=org.robolectric.shadows.ShadowPackageManager.class.getDeclaredMethod("setPackageArchiveInfo",String.class,PackageInfo.class);
        setter.setAccessible(true);setter.invoke(shadow,apk.getAbsolutePath(),info);
        new SettingsManager(context).setApkPath(apk.getAbsolutePath());
        UpdateResult result=new UpdateResult();new AppUpdateChecker(context,result).installUpdate();
        assertNull(result.error);Intent intent=Shadows.shadowOf((Application)context).getNextStartedActivity();
        assertNotNull(intent);assertEquals(Intent.ACTION_VIEW,intent.getAction());
        assertEquals("content",intent.getData().getScheme());
        assertEquals("application/vnd.android.package-archive",intent.getType());
        assertTrue((intent.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)!=0);
    }
    @Test public void failedHostKeepsCachedFileAndNextHostCompletesAtomicDownload() throws Exception {
        byte[] bytes=new byte[2_000_000];Arrays.fill(bytes,(byte)23);
        java.net.ServerSocket server=new java.net.ServerSocket(0,10,java.net.InetAddress.getByName("127.0.0.1"));
        Thread worker=new Thread(()->{
            try {
                for(int request=0;request<3;request++)try(java.net.Socket socket=server.accept()) {
                    BufferedReader reader=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.US_ASCII));
                    String first=reader.readLine(),line;while((line=reader.readLine())!=null&&!line.isEmpty()){}
                    boolean good=first.contains("/good ");
                    OutputStream out=socket.getOutputStream();
                    out.write(("HTTP/1.1 "+(good?"200 OK":"503 Unavailable")+"\r\nContent-Length: "+(good?bytes.length:0)+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                    if(good)out.write(bytes);out.flush();
                }
            }catch(IOException closed){}
        });worker.setDaemon(true);worker.start();
        try {
            AppDownloader downloader=new AppDownloader(context,new AppDownloaderListener(){
                public void onApkDownloaded(String path){}public void onDownloadError(Exception error){}},1_000_000);
            Class<?> type=Class.forName(AppDownloader.class.getName()+"$AppDownloadTask");
            Constructor<?> ctor=type.getDeclaredConstructor(AppDownloader.class);ctor.setAccessible(true);Object task=ctor.newInstance(downloader);
            Method download=type.getDeclaredMethod("downloadPackage",String.class);download.setAccessible(true);
            String base="http://127.0.0.1:"+server.getLocalPort();
            File cached=new File(context.getCacheDir(),"update.apk");Files.write(cached.toPath(),new byte[]{1,2,3});
            assertNull(download.invoke(task,base+"/bad"));
            assertArrayEquals(new byte[]{1,2,3},Files.readAllBytes(cached.toPath()));
            Exception cause=(Exception)field(AppDownloader.class,"mLastDownloadError").get(downloader);
            assertTrue(cause.getMessage().contains("HTTP 503"));
            Method background=type.getDeclaredMethod("doInBackground",Uri[][].class);background.setAccessible(true);
            String path=(String)background.invoke(task,(Object)new Uri[][]{{Uri.parse(base+"/bad"),Uri.parse(base+"/good")}});
            assertEquals(cached.getAbsolutePath(),path);assertArrayEquals(bytes,Files.readAllBytes(cached.toPath()));
            assertFalse(new File(context.getCacheDir(),"update-download.apk").exists());
        } finally {server.close();worker.join(2000);}
    }
    @Test public void exhaustedDownloadReportsCauseInsteadOfNullPath() throws Exception {
        final Exception[] captured={null};
        AppDownloader downloader=new AppDownloader(context,new AppDownloaderListener(){
            public void onApkDownloaded(String path){fail();}public void onDownloadError(Exception error){captured[0]=error;}},1_000_000);
        Exception cause=new IllegalStateException("HTTP 503 from update host");
        field(AppDownloader.class,"mLastDownloadError").set(downloader,cause);
        Class<?> type=Class.forName(AppDownloader.class.getName()+"$AppDownloadTask");
        Constructor<?> ctor=type.getDeclaredConstructor(AppDownloader.class);ctor.setAccessible(true);Object task=ctor.newInstance(downloader);
        Method finish=type.getDeclaredMethod("onPostExecute",String.class);finish.setAccessible(true);finish.invoke(task,new Object[]{null});
        assertSame(cause,captured[0].getCause());assertFalse(captured[0].getMessage().contains("path is null"));
        assertFalse(downloader.isInProgress());
    }
}
