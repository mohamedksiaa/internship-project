/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.6.23-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: dolibarr
-- ------------------------------------------------------
-- Server version	10.6.23-MariaDB-0ubuntu0.22.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `llx_timeflow_timeentry`
--

DROP TABLE IF EXISTS `llx_timeflow_timeentry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `llx_timeflow_timeentry` (
  `rowid` int(11) NOT NULL AUTO_INCREMENT,
  `entity` int(11) NOT NULL DEFAULT 1,
  `fk_user` int(11) NOT NULL,
  `fk_project` int(11) DEFAULT NULL,
  `fk_task` int(11) DEFAULT NULL,
  `date_start` datetime NOT NULL,
  `date_end` datetime DEFAULT NULL,
  `duration` int(11) DEFAULT 0,
  `occurrence_count` int(11) NOT NULL DEFAULT 1,
  `date_reprise` datetime DEFAULT NULL,
  `note` text DEFAULT NULL,
  `billable` tinyint(4) DEFAULT 0,
  `status` int(11) NOT NULL DEFAULT 0,
  `fk_user_valid` int(11) DEFAULT NULL,
  `date_creation` datetime NOT NULL,
  `tms` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `date_delete` datetime DEFAULT NULL,
  `fk_user_creat` int(11) NOT NULL,
  `fk_user_modif` int(11) DEFAULT NULL,
  `fk_user_delete` int(11) DEFAULT NULL,
  `import_key` varchar(14) DEFAULT NULL,
  `is_manually_edited` tinyint(4) NOT NULL DEFAULT 0,
  `tags` text DEFAULT NULL,
  `thm` double(24,8) DEFAULT NULL,
  `amount` double(24,8) DEFAULT NULL,
  `fk_facture` int(11) DEFAULT NULL,
  `date_invoice` datetime DEFAULT NULL,
  `date_submit` datetime DEFAULT NULL,
  `fk_user_submit` int(11) DEFAULT NULL,
  PRIMARY KEY (`rowid`),
  KEY `idx_clockify_timeentry_status` (`status`),
  KEY `idx_clockify_timeentry_fk_user_dateend` (`fk_user`,`date_end`),
  KEY `idx_clockify_timeentry_entity` (`entity`),
  KEY `idx_timeflow_timeentry_fk_user` (`fk_user`),
  KEY `idx_timeflow_timeentry_fk_project` (`fk_project`),
  KEY `idx_timeflow_timeentry_date_delete` (`date_delete`),
  KEY `idx_clockify_timeentry_fk_project` (`fk_project`),
  KEY `idx_clockify_timeentry_fk_user` (`fk_user`)
) ENGINE=InnoDB AUTO_INCREMENT=173 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-01 13:29:37
