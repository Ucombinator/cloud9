/*

* Copyright 2013 Raytheon BBN Technologies Corp.  All rights reserved.

*/
package com.example.agentsmith;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.PermissionInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Bundle;
import android.os.Environment;
import android.provider.ContactsContract;
import android.provider.ContactsContract.CommonDataKinds.Phone;
import android.util.Log;
import android.widget.Toast;

import com.example.agentsmith.MaliciousSignature.LevelEnum;
import com.example.agentsmith.SignatureDatabaseConnection.SignatureSource;

public class AppScanner extends AsyncTask<String,Double,Integer>{

	
	Context context;
	SignatureDatabaseConnection db;
	public AppScanner(Context c, SignatureDatabaseConnection sdc){
		context = c;
		db = sdc;
	}
	@Override
	protected Integer doInBackground(String... params) {
		//get list of apps
		PackageManager pm = context.getPackageManager();
        List<PackageInfo> packages = pm.getInstalledPackages(PackageManager.GET_PERMISSIONS);
        this.publishProgress(0.0);
        Log.d("SS", "Total Apps: " + packages.size());
        //scan each app
        int total = 0;
		for(double i =0; i<packages.size(); i++){
			PackageInfo app = packages.get((int) i);
			if(app.packageName.equals("android")){
				continue;
			}
			//check for malice
			List<MaliciousSignature> result = scanApp(app,db);
			//handle result
            if(result != null && !result.isEmpty()){
            	//we have maliciousness. Display results to user.
            	for(MaliciousSignature sig : result){
            		total++;
            		sig.appName = app.packageName;
            		ScanService.createNotification(app.packageName, sig,context);
            		db.addHistory(sig.timestamp, sig.ss + " " + sig.type,"Signature: "+sig.sig,  sig.appName, sig.trigger, sig.level );
            		
            		//If this sig is of severe importance, prompt the user to uninstall the app.
            		if(sig.level == LevelEnum.Severe ){
            			Log.i("SS", "Trying to remove app: " + app.packageName);
	    				Intent malIntent = new Intent(ScanService.REMOVE_MAL_APP);
	    				Bundle args = new Bundle();		    				
	    				args.putString("app_name", app.packageName);
	    				args.putString("sig", sig.sig);
	    				args.putString("package_name", app.packageName);
	    				malIntent.putExtra("args", args);
	    				context.sendBroadcast(malIntent);
            		}
            	}
            }
            else{
            	//all good.
            	Log.i("SS", "ALL CLEAR : " + app.packageName);
//            	Toast.makeText(ScanService.this, "No malicious activity detected for " + app.packageName + ".", Toast.LENGTH_LONG).show();
            }
            
            Log.d("SS", "Progress: " + (i/packages.size()) * 100);
            this.publishProgress((i/packages.size()) * 100);
           
		}
		
		boolean mExternalStorageAvailable = false;
		boolean mExternalStorageWriteable = false;
		String state = Environment.getExternalStorageState();

		if (Environment.MEDIA_MOUNTED.equals(state)) {
		    // We can read and write the media
		    mExternalStorageAvailable = mExternalStorageWriteable = true;
		} else if (Environment.MEDIA_MOUNTED_READ_ONLY.equals(state)) {
		    // We can only read the media
		    mExternalStorageAvailable = true;
		    mExternalStorageWriteable = false;
		} else {
		    // Something else is wrong. It may be one of many other states, but all we need
		    //  to know is we can neither read nor write
		    mExternalStorageAvailable = mExternalStorageWriteable = false;
		}
		
		
		File rootExtStorage = Environment.getExternalStorageDirectory();
		if(mExternalStorageAvailable){
		List<MaliciousSignature> fileResult = scanFileRecurse(rootExtStorage);
		
		 if(fileResult != null && !fileResult.isEmpty()){
            	//we have maliciousness. Display results to user.
            	for(MaliciousSignature sig : fileResult){
            		total++;
            		ScanService.createNotification(sig.appName, sig,context);
            		db.addHistory(sig.timestamp, sig.ss + " " + sig.type,"Signature: "+sig.sig,  sig.appName, sig.trigger, sig.level );
            		
            		//If this sig is of severe importance, prompt the user to uninstall the app.
            		if(sig.level == LevelEnum.Severe ){
            			Log.i("SS", "Trying to remove app: " +sig.appName);
	    				Intent malIntent = new Intent(ScanService.REMOVE_MAL_APP);
	    				Bundle args = new Bundle();		    				
	    				args.putString("app_name", sig.appName);
	    				args.putString("sig", sig.sig);
	    				args.putString("package_name", sig.appName);
	    				malIntent.putExtra("args", args);
	    				context.sendBroadcast(malIntent);
            		}
            	}
            }
            else{
            	//all good.
            	Log.i("SS", "External Files are clear");
//            	Toast.makeText(ScanService.this, "No malicious activity detected for " + app.packageName + ".", Toast.LENGTH_LONG).show();
            }
		}
		
		//TODO: scan contacts for pay numbers
		Uri uri = ContactsContract.Contacts.CONTENT_URI;
        String[] projection = new String[] { 
        		ContactsContract.Contacts._ID,
                ContactsContract.Contacts.DISPLAY_NAME,
                ContactsContract.Contacts.LOOKUP_KEY
        };
        String selection = ContactsContract.Contacts.IN_VISIBLE_GROUP + " = '"
                + ("1") + "'";
        String sortOrder = ContactsContract.Contacts.DISPLAY_NAME
                + " COLLATE LOCALIZED ASC";
        Cursor contacts = context.getContentResolver().query(uri, projection, selection, null,sortOrder);
        int id_row = contacts.getColumnIndex(ContactsContract.Contacts._ID);
        int name_row = contacts.getColumnIndex( ContactsContract.Contacts.DISPLAY_NAME);
        int key_row = contacts.getColumnIndex( ContactsContract.Contacts.LOOKUP_KEY);
        while(contacts.moveToNext()){
        	String id = "";
        	String name = "";
        	String key = "";
        	if(id_row != -1){
        		id = contacts.getString(id_row);
        	}
        	else{
        		Log.e("SS", "COULD NOT FIND DATA ROW");
        	}
        	if(name_row != -1){
        		name = contacts.getString(name_row);
        	}
        	
        	if(key_row != -1){
        		key = contacts.getString(key_row);
        	}
        	else{
        		Log.e("SS", "COULD NOT FIND KEY ROW");
        	}
        	
            String number = "";
            Cursor nums = context.getContentResolver()
                    .query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                            null,
                            ContactsContract.CommonDataKinds.Phone.CONTACT_ID
                                    + " = " + id, null, null);
            
            while (nums.moveToNext()) {
                number = nums.getString(nums.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER));
        	
	        	List<MaliciousSignature> result = scanNumber(number, name, db);
	        	
	        	 if(result != null && !result.isEmpty()){
	             	//we have maliciousness. Display results to user.
	             	for(MaliciousSignature sig : result){
	             		total++;
	             		sig.appName = name;
	             		ScanService.createNotification(name, sig,context);
	             		db.addHistory(sig.timestamp, sig.ss + " " + sig.type,"Signature: "+sig.sig,  sig.appName, sig.trigger, sig.level );
	             		
	            		//If this sig is of severe importance, prompt the user to remove contact.	             		
	             		if(sig.level == LevelEnum.Severe ){
		             		 try{
		                         Uri removeUri = Uri.withAppendedPath(ContactsContract.Contacts.CONTENT_LOOKUP_URI, key);
		                         Log.i("AS","REMOVAL URI: " + removeUri.toString());
		                         context.getContentResolver().delete(removeUri, null, null);
		                     }
		                     catch(Exception e)
		                     {
		                    	 e.printStackTrace();
		                     }
	            		}
	             	}
	             }
	             else{
	             	//all good.
	             	Log.i("SS", "ALL CLEAR : " + name + " '" + number +"'");
	//             	Toast.makeText(ScanService.this, "No malicious activity detected for " + app.packageName + ".", Toast.LENGTH_LONG).show();
	             }
            }
            
            nums.close();
        }
        
        contacts.close();
		
		return total;
	}
	public static List<MaliciousSignature> scanNumber(String number, String name, SignatureDatabaseConnection sdc) {
		List<MaliciousSignature> sigs = new ArrayList<MaliciousSignature>();

			Log.i("SS", "Contact name : " + name + " " + number);//
			sigs.addAll(sdc.getSignatures(number , SignatureSource.Contact, "Number"));
	
		return null;
	}
	private List<MaliciousSignature> scanFileRecurse(File rootExtStorage) {
		Log.d("AS", "recurse. D:" + rootExtStorage.getAbsolutePath() + " is?" + rootExtStorage.isDirectory() + " R:" + rootExtStorage.canRead() + " Out " +  rootExtStorage.listFiles() + " Outstr " +  rootExtStorage.list());
		List<MaliciousSignature> retList = new ArrayList<MaliciousSignature>();
		if(rootExtStorage != null &&  rootExtStorage.listFiles() != null){
			for(File f : rootExtStorage.listFiles()){
				if(f.isFile()){
					Log.i("AS", "File: " + f.getAbsolutePath());
					retList.addAll(scanFile(f,db));
				}
				else{
					Log.i("AS", "Dir: " + f.getAbsolutePath());
					retList.addAll(scanFileRecurse(f));
				}
			}
		}
		
		return retList;
	}

	public static List<MaliciousSignature> scanApp(PackageInfo pi, SignatureDatabaseConnection sdc) {
		
		List<MaliciousSignature> sigs = new ArrayList<MaliciousSignature>();

		if(pi.packageName != null){
			Log.i("SS", "package name : " + pi.packageName);
			sigs.addAll(sdc.getSignatures(pi.packageName , SignatureSource.Application, "Package"));
		}
		if(pi.permissions != null){
			for(PermissionInfo perm : pi.permissions){
				Log.i("SS", "PERM : " + perm.name);
				sigs.addAll(sdc.getSignatures(perm.name , SignatureSource.Application, "Permission"));
			}
		}
		
		
		return sigs;
	}
	
	public static List<MaliciousSignature> scanFile(File f, SignatureDatabaseConnection sdc) {
		String hash = ScanService.getHash(f);
		List<MaliciousSignature> retList = new ArrayList<MaliciousSignature>();
		if(!hash.equals("") ){
			Log.d("SS", "Hash : " +hash + " filename:" + f.getName());
			retList.addAll(sdc.getSignatures(hash , SignatureSource.File, "MD5"));
		}
		return retList;
	}

	
	@Override
	protected void onProgressUpdate(Double... vals){
		
		if(vals.length > 0){
			Intent i = new Intent(ScanService.BROADCAST_SCAN_PROGRESS);
			i.putExtra(ScanService.EXTRA_SCAN_PROGRESS, vals[0]);
			context.sendBroadcast(i);
		}
		
	}
	
	protected void onPostExecute(Integer result){
		 this.publishProgress(100.0);
		Toast.makeText(context, "Scan Complete! Malicious items detected: " +result, Toast.LENGTH_LONG).show();
	}
	
}
