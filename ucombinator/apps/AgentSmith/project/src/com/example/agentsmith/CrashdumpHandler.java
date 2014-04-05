/*

* Copyright 2013 Raytheon BBN Technologies Corp.  All rights reserved.

*/
package com.example.agentsmith;

import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.io.Writer;
import java.lang.Thread.UncaughtExceptionHandler;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

import org.apache.http.HttpResponse;
import org.apache.http.NameValuePair;
import org.apache.http.client.entity.UrlEncodedFormEntity;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.InputStreamEntity;
import org.apache.http.impl.client.DefaultHttpClient;
import org.apache.http.message.BasicNameValuePair;
import org.apache.http.params.HttpConnectionParams;
import org.apache.http.params.HttpParams;
import org.apache.http.protocol.HTTP;

import android.content.Context;
import android.database.Cursor;
import android.os.AsyncTask;
import android.util.Log;

public class CrashdumpHandler implements UncaughtExceptionHandler {
	
	
	Context c;
	public CrashdumpHandler(Context context){
		c = context;
	}

	final String url = "http://www.example.com";
	final String hist_filename = "history_file";
	@Override
	public void uncaughtException(Thread t, Throwable err) {
		
		err.printStackTrace();
		
		//gather debug information
		String timestamp = Calendar.getInstance().getTime().toString();		
        final Writer result = new StringWriter();
        final PrintWriter printWriter = new PrintWriter(result);
        err.printStackTrace(printWriter);
        String stacktrace = result.toString();
        printWriter.close();

        SignatureDatabaseConnection sdc = new SignatureDatabaseConnection(c);
        
        //create history file
        Cursor curse = sdc.getHistoryCursorAll();
        FileOutputStream fos;
		try {
			fos = c.openFileOutput(hist_filename, Context.MODE_PRIVATE);
			int time_row = curse.getColumnIndex(SignatureDatabaseConnection.TIME);
			int type_row = curse.getColumnIndex(SignatureDatabaseConnection.TYPE);
			int desc_row = curse.getColumnIndex(SignatureDatabaseConnection.DESCRIPTION);
			int data_row = curse.getColumnIndex(SignatureDatabaseConnection.DATA);
	        OutputStreamWriter osw = new OutputStreamWriter(fos);
	        while(curse.moveToNext()){
	        	String line = "";
	        	if(time_row != -1){
					line += curse.getString(time_row) + ",";
				}
	        	if(type_row != -1){
					line += curse.getString(type_row) + ",";
				}
	        	if(desc_row != -1){
					line += "\'" + curse.getString(desc_row) + "\'";
				}
	        	else{
	        		Log.w("cdH", "DESC ROW NOT FOUND!");
	        	}
	        	if(data_row != -1){
					line += "\'" + curse.getString(data_row) + "\'";
				}
	        	else{
	        		Log.w("cdH", "DATA ROW NOT FOUND!");
	        	}
	        	if(!line.equals("")){
	        		line += "\n";
	        	}
	        	osw.write(line);
	        }
	        osw.flush();
	        osw.close();
	        
		} catch (Exception e) {
			e.printStackTrace();
		}
		
        curse.close();
		sdc.close();
		
        if (url != null) {
            CrashInfoSender cis = new CrashInfoSender();
            cis.execute(stacktrace, timestamp, hist_filename);
        }

	}
	public class CrashInfoSender extends AsyncTask<String,String,String>{

		@Override
		protected String doInBackground(String... arg0) {
			if(arg0.length <3){
				Log.e("CIS", "NOT ENOUGH ARGS");
			}
			String stacktrace = arg0[0];
			String timestamp = arg0[1];
			String filePath = arg0[2];
			sendToServer(stacktrace, timestamp, filePath);
			
			c.deleteFile(hist_filename);
			
			return null;
		}
		
		private void sendToServer(String stacktrace, String timestamp, String filePath) {
	        DefaultHttpClient httpClient = new DefaultHttpClient();
	        final HttpParams httpParams = httpClient.getParams();
	        HttpConnectionParams.setConnectionTimeout(httpParams, 5000);
	        HttpConnectionParams.setSoTimeout(httpParams, 5000);
	        
	        HttpPost httpPost = new HttpPost(url);
	        List<NameValuePair> nvp = new ArrayList<NameValuePair>();
	        nvp.add(new BasicNameValuePair("timestamp", timestamp));
	        nvp.add(new BasicNameValuePair("stacktrace", stacktrace));
	        
	        try {
		        InputStreamEntity reqEntity = new InputStreamEntity(
		               c.openFileInput(filePath), -1);
		        reqEntity.setContentType("binary/octet-stream");
		        reqEntity.setChunked(true);
		        httpPost.setEntity(reqEntity);

	            httpClient.execute(httpPost);
	        } catch (IOException e) {
	            e.printStackTrace();
	        }
	    }
		
	}
	

}
