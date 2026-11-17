package com.liskovsoft.smartyoutubetv2.mobile.sync;

import static org.junit.Assert.*;

import android.content.Intent;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import com.google.android.exoplayer2.C;
import com.google.android.exoplayer2.Player;
import com.google.android.exoplayer2.source.SinglePeriodTimeline;
import com.google.android.exoplayer2.source.TrackGroupArray;
import com.google.android.exoplayer2.trackselection.TrackSelectionArray;
import com.google.android.exoplayer2.ui.PlayerView;
import com.liskovsoft.smartyoutubetv2.tv.R;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;

/** Real Activity, PlayerView, controller buttons and time bar; no codecs or network. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
@LooperMode(LooperMode.Mode.PAUSED)
public class RumbleTvRemoteTest {
    private ActivityController<PatRumblePlayerActivity> controller;
    private PatRumblePlayerActivity activity;
    private PlayerView view;
    private Button follow;
    private final List<Player.EventListener> listeners = new ArrayList<>();
    private boolean playing = true, seekable = true;
    private long position = 60_000;
    private int toggles, seeks;
    private long downTime;

    private Object field(String name) throws Exception {
        Field field = PatRumblePlayerActivity.class.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(activity);
    }

    @Before public void create() throws Exception {
        Intent intent = new Intent().putExtra(PatRumblePlayerActivity.EXTRA_VIDEO,
                "{\"id\":\"remote-fixture\",\"title\":\"Remote test\",\"channelId\":\"fixture-channel\"}");
        controller = Robolectric.buildActivity(PatRumblePlayerActivity.class, intent)
                .create().start().resume().visible().windowFocusChanged(true);
        activity = controller.get();
        view = (PlayerView) field("view");
        follow = (Button) field("follow");
        // ViewRoot normally leaves touch mode before delivering physical remote keys.
        Object root = org.robolectric.util.ReflectionHelpers.callInstanceMethod(
                activity.getWindow().getDecorView(), "getViewRootImpl");
        org.robolectric.util.ReflectionHelpers.callInstanceMethod(root, "ensureTouchMode",
                org.robolectric.util.ReflectionHelpers.ClassParameter.from(boolean.class, false));
    }

    private void attachPlayer() throws Exception {
        Player player = (Player) Proxy.newProxyInstance(Player.class.getClassLoader(),
                new Class<?>[]{Player.class}, (proxy, method, args) -> {
                    switch (method.getName()) {
                        case "getApplicationLooper": return Looper.getMainLooper();
                        case "getPlaybackState": return Player.STATE_READY;
                        case "getPlayWhenReady": return playing;
                        case "setPlayWhenReady":
                            playing = (boolean) args[0]; toggles++;
                            for (Player.EventListener l : new ArrayList<>(listeners))
                                l.onPlayerStateChanged(playing, Player.STATE_READY);
                            return null;
                        case "getCurrentPosition": case "getContentPosition": return position;
                        case "getDuration": case "getContentDuration": return 600_000L;
                        case "getBufferedPosition": case "getContentBufferedPosition": return position;
                        case "getCurrentTimeline": return new SinglePeriodTimeline(
                                600_000_000L, seekable, !seekable, null);
                        case "isCurrentWindowSeekable": return seekable;
                        case "getCurrentTrackGroups": return TrackGroupArray.EMPTY;
                        case "getCurrentTrackSelections": return new TrackSelectionArray();
                        case "getNextWindowIndex": case "getPreviousWindowIndex": return C.INDEX_UNSET;
                        case "addListener": listeners.add((Player.EventListener) args[0]); return null;
                        case "removeListener": listeners.remove(args[0]); return null;
                        case "seekTo": position = ((Number) args[args.length - 1]).longValue(); seeks++; return null;
                        case "equals": return proxy == args[0];
                        case "hashCode": return System.identityHashCode(proxy);
                    }
                    Class<?> type = method.getReturnType();
                    if (type == boolean.class) return false;
                    if (type == int.class) return 0;
                    if (type == long.class) return 0L;
                    if (type == float.class) return 1f;
                    return null;
                });
        ((View) field("loading")).setVisibility(View.GONE);
        view.setPlayer(player);
        layout();
    }

    private void layout() {
        View decor = activity.getWindow().getDecorView();
        decor.measure(View.MeasureSpec.makeMeasureSpec(1920, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY));
        decor.layout(0, 0, 1920, 1080);
    }

    private void key(int action, int code, int repeats) {
        long now = SystemClock.uptimeMillis();
        if (action == KeyEvent.ACTION_DOWN && repeats == 0) downTime = now;
        KeyEvent event = new KeyEvent(downTime, now, action, code, repeats, 0, -1, 0,
                KeyEvent.FLAG_FROM_SYSTEM, android.view.InputDevice.SOURCE_DPAD);
        // Include ViewRoot's unhandled-key focus navigation, not just Activity.dispatchKeyEvent.
        Object root = org.robolectric.util.ReflectionHelpers.callInstanceMethod(
                activity.getWindow().getDecorView(), "getViewRootImpl");
        org.robolectric.util.ReflectionHelpers.callInstanceMethod(root, "dispatchInputEvent",
                org.robolectric.util.ReflectionHelpers.ClassParameter.from(android.view.InputEvent.class, event));
        org.robolectric.Shadows.shadowOf(Looper.getMainLooper()).idle();
    }
    private void press(int code) {
        key(KeyEvent.ACTION_DOWN, code, 0);
        key(KeyEvent.ACTION_UP, code, 0);
        org.robolectric.Shadows.shadowOf(Looper.getMainLooper()).idle();
        layout();
    }

    @After public void destroy() {
        if (view != null) view.setPlayer(null);
        controller.pause().stop().destroy();
    }

    @Test public void initialFocusBelongsToPlaybackNotFollow() {
        assertTrue("Player must receive remote events before controls appear; focus=" + activity.getCurrentFocus() + "; root=" + view + "; focusable=" + view.isFocusable(), view.hasFocus());
        assertFalse(follow.hasFocus());
    }

    @Test public void hiddenCenterPausesOnceDespiteRepeatsAndNextPressResumes() throws Exception {
        attachPlayer(); view.hideController();
        key(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_CENTER, 0);
        key(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_CENTER, 1);
        key(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_CENTER, 2);
        key(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_CENTER, 0);
        assertFalse(playing); assertEquals(1, toggles);
        assertTrue(view.isControllerVisible());
        press(KeyEvent.KEYCODE_DPAD_CENTER);
        assertTrue(playing); assertEquals(2, toggles);
    }

    @Test public void physicalMediaKeysWorkWhileFollowHasFocus() throws Exception {
        attachPlayer(); follow.requestFocus();
        press(KeyEvent.KEYCODE_MEDIA_PAUSE); assertFalse(playing);
        press(KeyEvent.KEYCODE_MEDIA_PLAY); assertTrue(playing);
        press(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE); assertFalse(playing);
        press(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD); assertEquals(75_000, position);
        press(KeyEvent.KEYCODE_MEDIA_REWIND); assertEquals(70_000, position);
    }

    @Test public void hiddenDirectionsSeekOnDownAndHoldButNotOnReleaseAndClamp() throws Exception {
        attachPlayer(); view.hideController();
        key(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_RIGHT, 0);
        key(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_RIGHT, 1);
        key(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_RIGHT, 0);
        assertEquals(90_000, position); assertEquals(2, seeks);
        view.hideController(); press(KeyEvent.KEYCODE_DPAD_LEFT); assertEquals(85_000, position);
        position = 599_000; view.hideController(); press(KeyEvent.KEYCODE_DPAD_RIGHT);
        assertEquals(600_000, position);
        position = 1_000; view.hideController(); press(KeyEvent.KEYCODE_DPAD_LEFT);
        assertEquals(0, position);
    }

    @Test public void nonSeekableStreamStillPausesWithoutInvalidSeeks() throws Exception {
        seekable = false; attachPlayer(); view.hideController();
        press(KeyEvent.KEYCODE_DPAD_RIGHT); assertEquals(0, seeks);
        view.hideController(); press(KeyEvent.KEYCODE_DPAD_LEFT); assertEquals(0, seeks);
        view.hideController(); press(KeyEvent.KEYCODE_DPAD_CENTER); assertFalse(playing);
    }

    @Test public void upDownNavigateFollowButtonsAndTimeBarAndCenterKeepsButtonMeaning() throws Exception {
        attachPlayer(); view.hideController(); press(KeyEvent.KEYCODE_DPAD_DOWN);
        assertTrue(view.isControllerVisible());
        assertTrue(view.findViewById(R.id.exo_pause).hasFocus());
        press(KeyEvent.KEYCODE_DPAD_UP); assertTrue(follow.hasFocus());
        press(KeyEvent.KEYCODE_DPAD_CENTER);
        assertTrue(new PatSyncClient(activity).isFollowed("fixture-channel"));
        assertEquals(0, toggles);
        press(KeyEvent.KEYCODE_DPAD_DOWN);
        assertTrue(view.findViewById(R.id.exo_pause).hasFocus());
        press(KeyEvent.KEYCODE_DPAD_RIGHT);
        assertTrue("After RIGHT focus=" + activity.getCurrentFocus(), view.findViewById(R.id.exo_ffwd).hasFocus());
        press(KeyEvent.KEYCODE_DPAD_CENTER); assertEquals(75_000, position);
        press(KeyEvent.KEYCODE_DPAD_DOWN);
        assertTrue(view.findViewById(R.id.exo_progress).hasFocus());
        press(KeyEvent.KEYCODE_DPAD_RIGHT);
        press(KeyEvent.KEYCODE_DPAD_CENTER); assertTrue(position > 75_000);
        press(KeyEvent.KEYCODE_DPAD_UP);
        assertTrue(view.findViewById(R.id.exo_pause).hasFocus());
    }

    @Test public void backHidesControlsOnceThenExits() throws Exception {
        attachPlayer(); view.hideController(); press(KeyEvent.KEYCODE_DPAD_DOWN);
        key(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK, 0);
        key(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK, 1);
        key(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK, 0);
        assertFalse(activity.isFinishing()); assertFalse(view.isControllerVisible());
        assertTrue(view.hasFocus());
        press(KeyEvent.KEYCODE_DPAD_DOWN); assertTrue(view.isControllerVisible());
        press(KeyEvent.KEYCODE_BACK); assertFalse(activity.isFinishing());
        press(KeyEvent.KEYCODE_BACK); assertTrue(activity.isFinishing());
    }

    @Test public void controllerTimeoutReturnsFocusAndRemoteWorksAfterResume() throws Exception {
        attachPlayer(); view.setControllerShowTimeoutMs(1000); press(KeyEvent.KEYCODE_DPAD_DOWN);
        org.robolectric.Shadows.shadowOf(Looper.getMainLooper()).idleFor(1001, java.util.concurrent.TimeUnit.MILLISECONDS);
        assertFalse(view.isControllerVisible()); assertTrue(view.hasFocus());
        controller.pause().stop().start().resume().windowFocusChanged(true);
        press(KeyEvent.KEYCODE_DPAD_CENTER); assertFalse(playing);
    }

    @Test public void reopeningAfterBackStartsFocusedAndCanPauseAgain() throws Exception {
        attachPlayer(); view.hideController(); press(KeyEvent.KEYCODE_BACK);
        assertTrue(activity.isFinishing());
        destroy();
        create();
        assertTrue(view.hasFocus()); assertFalse(follow.hasFocus());
        attachPlayer(); view.hideController(); press(KeyEvent.KEYCODE_DPAD_CENTER);
        assertFalse(playing); assertEquals(1, toggles);
    }

    @Test public void missingChannelAndPlayerStillAllowControlsAndBack() throws Exception {
        follow.setVisibility(View.GONE);
        press(KeyEvent.KEYCODE_DPAD_DOWN); assertTrue(view.isControllerVisible());
        press(KeyEvent.KEYCODE_DPAD_UP); assertTrue(view.hasFocus());
        press(KeyEvent.KEYCODE_BACK); assertFalse(activity.isFinishing());
        press(KeyEvent.KEYCODE_BACK); assertTrue(activity.isFinishing());
    }

    @Test public void enterPausesAndSeekingKeepsPausedState() throws Exception {
        attachPlayer(); view.hideController(); press(KeyEvent.KEYCODE_ENTER);
        assertFalse(playing);
        view.hideController(); press(KeyEvent.KEYCODE_DPAD_RIGHT);
        assertFalse(playing); assertEquals(75_000, position); assertEquals(1, toggles);
        key(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, 0);
        key(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, 1);
        key(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, 0);
        assertTrue(playing); assertEquals(2, toggles);
    }
}
