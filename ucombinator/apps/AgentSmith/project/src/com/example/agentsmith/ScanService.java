/*

* Copyright 2013 Raytheon BBN Technologies Corp.  All rights reserved.

*/
package com.example.agentsmith;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.util.Calendar;
import java.util.Date;
import java.util.List;

import android.app.ActivityManager;
import android.app.ActivityManager.RunningAppProcessInfo;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipData.Item;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.PackageManager.NameNotFoundException;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;
import android.widget.Toast;

import com.example.agentsmith.MaliciousSignature.LevelEnum;
import com.example.agentsmith.SignatureDatabaseConnection.SignatureSource;

public class ScanService extends Service {

	private BroadcastReceiver installReceiver;
	public static final String ACTION_SCAN_APPS = "com.example.agentsmith.scanapps";
	public static final String BROADCAST_SCAN_PROGRESS = "com.example.agentsmith.scan_progress_broadcast";
	public static final String EXTRA_SCAN_PROGRESS ="scan_progress";
	public static final String REMOVE_MAL_APP = "com.example.agentsmith.remove_app";
	private SignatureDatabaseConnection sdc;
	private final String dn = "SS";
	private static int notificationUnique;
	private static int notifyID; 

	@Override
	public void onCreate() {
		
		sdc = new SignatureDatabaseConnection(this);
		
		//register listener for app install
		    installReceiver = new BroadcastReceiver() {

		        @Override
		        public void onReceive(Context context, Intent intent) {
		            Log.i(dn, "Installing app.");		            

		            Log.e("SS", "INTENT DATA: " + intent.getData());
		            
		            Bundle b_extra = intent.getExtras();
		            int uid = b_extra.getInt(Intent.EXTRA_UID);
		            PackageManager pm = getPackageManager();
		            String[] packages = pm.getPackagesForUid(uid);
		            for(String p: packages){
		        	   PackageInfo pi;
		        	   try {
							pi = pm.getPackageInfo(p, PackageManager.GET_PERMISSIONS);
	
				            String name = pi.packageName;
				            
				            List<MaliciousSignature> result = AppScanner.scanApp(pi, sdc);
				            
				          //handle result
				            if(result != null && !result.isEmpty()){
				            	//we have maliciousness. Display results to user.
				            	for(MaliciousSignature sig : result){
				            		createNotification(name, sig,ScanService.this);
				            		sdc.addHistory(sig.timestamp, sig.ss + " " + sig.type,"Signature: "+sig.sig,  sig.appName, sig.trigger, sig.level  );
				            		
				            		//If this sig is of severe importance, prompt the user to uninstall the app.
				            		if(sig.level == LevelEnum.Severe ){
				            			Log.i("SS", "Trying to remove app: " + pi.packageName);
					    				Intent malIntent = new Intent(REMOVE_MAL_APP);
					    				Bundle args = new Bundle();		    				
					    				args.putString("app_name", pi.packageName);
					    				args.putString("sig", sig.sig);
					    				args.putString("package_name", pi.packageName);
					    				malIntent.putExtra("args", args);
					    				context.sendBroadcast(malIntent);
				            		}
				            	}
				            }
				            else{
				            	//all good.
				            	Log.i("SS", "ALL CLEAR : " + name);
				            	Toast.makeText(ScanService.this, "No malicious activity detected for " + name + ".", Toast.LENGTH_LONG).show();
				            }
						} catch (NameNotFoundException e) {
							e.printStackTrace();
						}
		            }
		          

		           
		        }



		    };
		    
		    IntentFilter intentFilter = new IntentFilter();
		    intentFilter.addAction(Intent.ACTION_PACKAGE_ADDED);
		    intentFilter.addAction(Intent.ACTION_PACKAGE_INSTALL);
		    intentFilter.addDataScheme("package");
		    registerReceiver(installReceiver, intentFilter);
		    
		    //register listener for clipboard change
		    ClipboardManager clipBoard = (ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
		    clipBoard.addPrimaryClipChangedListener( new ClipboardListener() );
		    
		    //register scheduled scan every night at midnight
			AlarmManager am = (AlarmManager)getApplicationContext().getSystemService(Context.ALARM_SERVICE);
			Intent i = new Intent(getApplicationContext(), this.getClass());
			i.setAction(ACTION_SCAN_APPS);
			PendingIntent pi =PendingIntent.getService(this, 0, i, 0);
			Calendar cal = Calendar.getInstance();
			cal.setTime(new Date(System.currentTimeMillis()));
			cal.add(Calendar.DAY_OF_YEAR, 1);
			cal.set(Calendar.HOUR_OF_DAY, 0);
			cal.set(Calendar.MINUTE, 0);
			am.setInexactRepeating(AlarmManager.RTC, cal.getTime().getTime(), AlarmManager.INTERVAL_DAY, pi);
		
	}
	
	 @Override
	 public int onStartCommand(Intent intent, int flags, int startId) {
		 if(intent != null){
	        Log.i(dn, "Received start id " + startId + ": " + intent.getAction());
	        if(intent.getAction() != null){
		        if(intent.getAction().equals(ACTION_SCAN_APPS)){
		        		Log.i("SS", "Starting new scan!");
		        		AppScanner as = new AppScanner(this, sdc);
		        		as.execute("");
		        }
	        }
		 }
	        
	        // We want this service to continue running until it is explicitly
	        // stopped, so return sticky.
	        return START_STICKY;
	 }
	
	/**
	 * Calculate the MD5 hash of an input file
	 * @param f
	 * @return
	 */
	public static String getHash(File f){
		try{
			
		    InputStream fis =  new FileInputStream(f);

		    byte[] buffer = new byte[1024];
		    MessageDigest complete = MessageDigest.getInstance("MD5");
		    int numRead;
		    do {
		    	numRead = fis.read(buffer);
		        if (numRead > 0) {
		            complete.update(buffer, 0, numRead);
		        }
		    } while (numRead != -1);
		    fis.close();
		    byte[] hashbytes = complete.digest();
		    //convert from byte array to hex string
	        StringBuffer hexString = new StringBuffer();
	    	for (int i=0;i<hashbytes.length;i++) {
	    	  hexString.append(Integer.toHexString(0xFF & hashbytes[i]));
	    	}
		    return hexString.toString();
		}
		catch(Exception e){
			e.printStackTrace();
		}
		return "";
		
	}
	

		public  static void createNotification(String name,
				MaliciousSignature sig,Context c) {
			//create the builder for the notification
			Notification.Builder mBuilder =
			        new Notification.Builder(c)
			        .setSmallIcon(R.drawable.ic_launcher)
			        .setAutoCancel(true)
			        .setContentTitle("ALERT!!!")
			        .setContentText("App:" + name + "|Description:" + sig.toString());
			
			//create the intent to activate when notification is pressed.
			Intent i = new Intent(c, MainActivity.class);			
			PendingIntent resultPendingIntent = PendingIntent.getActivity(c,
			        notificationUnique++, i,
			        PendingIntent.FLAG_UPDATE_CURRENT);
			mBuilder.setContentIntent(resultPendingIntent);
			NotificationManager mNotificationManager =
			    (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);

			mNotificationManager.notify(notifyID++, mBuilder.getNotification());
			
		}



	@Override
	public IBinder onBind(Intent arg0) {
		// TODO Auto-generated method stub
		return null;
	}

	
	@Override
	public void onDestroy(){
		unregisterReceiver(installReceiver);
		super.onDestroy();
		sdc.close();
	}
	
	class ClipboardListener implements ClipboardManager.OnPrimaryClipChangedListener
	{
	   public void onPrimaryClipChanged()
	   {
		   ClipboardManager clipBoard = (ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
		   ClipData cdata = clipBoard.getPrimaryClip();
		   String text = "";
		   if(cdata.getItemCount() > 0){
			   Item i = cdata.getItemAt(0);
			   CharSequence cs = i.coerceToText(ScanService.this);
			   text = cs.toString();
		   }
		   ClipDescription cd = clipBoard.getPrimaryClipDescription();
		   ActivityManager activityManager = (ActivityManager) ScanService.this.getSystemService( Context.ACTIVITY_SERVICE );
		   List<RunningAppProcessInfo> appProcesses = activityManager.getRunningAppProcesses();
		   String proc = "";
		   for(RunningAppProcessInfo appProcess : appProcesses){
		       if(appProcess.importance == RunningAppProcessInfo.IMPORTANCE_FOREGROUND){
		           proc = appProcess.processName;
		           Log.i(dn, "FOREGROUND: " + proc);
		       }
		   }
		  
		   
           List<MaliciousSignature> result =  sdc.getSignatures(text, SignatureSource.Clipboard,"CLIP");
           
           Log.i("SS", "Detected: " + result.size());
           if(result != null && !result.isEmpty()){
           	for(MaliciousSignature sig : result){
           		if(sig.level.equals(LevelEnum.Moderate) || sig.level.equals(LevelEnum.Severe)){
           			createNotification("Clipboard", sig,ScanService.this);
           		}
           		sdc.addHistory(sig.timestamp, sig.ss + " " + sig.type ,"Signature: "+sig.sig,  sig.appName, sig.trigger, sig.level  );
           	}
           }
           else{
	           	//all good.
	           	Toast.makeText(ScanService.this, "No malicious activity detected for clipboard", Toast.LENGTH_LONG).show();
           }
		   
		   
	   }
	   

	}
	
	

}
